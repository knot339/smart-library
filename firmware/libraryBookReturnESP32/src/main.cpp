#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "secrets.h"

// ===== WiFi & MQTT =====
const int   MQTT_PORT     = 1883;

// ===== RFID (Serial2) =====
#define RXD2 16
#define TXD2 17
#define MAX_BOOKS 10
const unsigned long COLLECTION_WINDOW = 2000;

String collectedBooks[MAX_BOOKS];
int bookCount = 0;
String rawBuffer = "";
unsigned long firstScanTime = 0;
bool isCollecting = false;
unsigned long lastReceiveTime = 0;
const unsigned long timeoutGap = 25;

// ===== LED =====
#define LED_PIN 2

// ===== Ultrasonic (HC-SR04) ตรวจจับตู้เต็ม =====
#define ULTRASONIC_TRIG_PIN 12
#define ULTRASONIC_ECHO_PIN 13
const int ULTRASONIC_FULL_DISTANCE_CM = 30;      // ระยะที่ถือว่าตู้เต็ม (ปรับตามตำแหน่งติดตั้งจริง)
const unsigned long ULTRASONIC_CHECK_INTERVAL = 1000; // เช็คระยะทุก 1 วินาที
const int ULTRASONIC_CONFIRM_COUNT = 3;          // ต้องอ่านค่าเข้าเงื่อนไขติดกันกี่ครั้งก่อนยืนยันเปลี่ยนสถานะ (กันค่าอ่านเพี้ยน/หนังสือขยับผ่าน)

unsigned long lastUltrasonicCheck = 0;
bool cabinetFull = false;
int fullReadingStreak = 0;
int emptyReadingStreak = 0;

// ===== BTS7960 Motor Driver (1 มอเตอร์) =====
#define MOTOR_RPWM 26
#define MOTOR_LPWM 25
#define MOTOR_EN   27 // R_EN และ L_EN มัดรวมกัน

int motorSpeed = 255; // ความเร็วสูงสุด (0–255)

// ตั้งค่าระยะเวลาทำงานของมอเตอร์ (ค่าคงที่)
const unsigned long STEP_DURATION = 10000; // เวลาสำหรับ 1 ช่วง (เช่น จาก Dump -> Open หรือ Open -> Close) คือ 10 วินาที
const unsigned long MAX_DURATION = 20000;  // เวลาสูงสุด (2 ช่วง: หดสุดไปยืดสุด) คือ 20 วินาที

// สถานะตำแหน่งมอเตอร์: -1 = Unknown, 0 = Dump (หดสุด), 1 = Open (ตรงกลาง), 2 = Close (ยืดสุด)
int currentPos = -1;
int targetPos = -1;

// ตัวแปรจับเวลาสำหรับหยุดมอเตอร์
unsigned long motorStartTime = 0;
unsigned long motorRunDuration = 0;
bool isMotorRunning = false;

// ตัวแปรจับเวลาสำหรับ reconnect แบบไม่บล็อก
unsigned long lastMqttReconnectAttempt = 0;
unsigned long lastWifiRetryTime = 0;

// ----- ฟังก์ชันควบคุมมอเตอร์ -----
void motorStop() {
  analogWrite(MOTOR_RPWM, 0);
  analogWrite(MOTOR_LPWM, 0);
}

void motorForward(int spd) {
  analogWrite(MOTOR_LPWM, 0);
  analogWrite(MOTOR_RPWM, spd);
}

void motorBackward(int spd) {
  analogWrite(MOTOR_RPWM, 0);
  analogWrite(MOTOR_LPWM, spd);
}
// -----------------------------------

WiFiClient espClient;
PubSubClient mqtt(espClient);

// ----- ฟังก์ชันตรวจจับตู้เต็มด้วย Ultrasonic (HC-SR04) -----
// คืนระยะเป็นเซนติเมตร หรือ -1 ถ้าไม่มี echo กลับมา (นอกระยะ/เซนเซอร์มีปัญหา)
long readUltrasonicDistanceCm() {
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(ULTRASONIC_TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);

  long duration = pulseIn(ULTRASONIC_ECHO_PIN, HIGH, 30000); // timeout 30ms (~5m)
  if (duration == 0) return -1;
  return duration / 58; // สูตรแปลง duration (us) เป็นระยะ (cm)
}

// ส่งสถานะตู้เต็ม/ว่างไปยัง backend ผ่าน MQTT เพื่อให้เข้าไปอัปเดต hardware.Shared.IsFull
void publishFullStatus(bool full) {
  StaticJsonDocument<128> doc;
  doc["type"] = "full";
  doc["value"] = full ? "true" : "false";
  char payload[128];
  serializeJson(doc, payload);
  mqtt.publish("smartlibrary/esp32/full", payload);
  Serial.printf("[SENSOR] สถานะตู้เปลี่ยนเป็น: %s\n", full ? "เต็ม" : "ไม่เต็ม");
}

// อ่านค่าระยะและตัดสินใจสถานะตู้เต็ม เรียกจาก loop() แบบไม่บล็อกทุก ULTRASONIC_CHECK_INTERVAL
void checkCabinetFull() {
  long dist = readUltrasonicDistanceCm();
  // dist < 0 คือไม่มี echo กลับมาภายใน timeout ซึ่งแปลว่าไม่มีอะไรอยู่ใกล้ๆ (ตู้ว่าง)
  // ไม่ใช่ "อ่านค่าไม่ได้" ต้องนับเป็นค่าว่างด้วย ไม่งั้นถ้าเกิดซ้ำๆ ตอนตู้ว่าง สถานะจะค้างเป็นเต็มตลอดไป
  bool isFullReading = dist >= 0 && dist <= ULTRASONIC_FULL_DISTANCE_CM;
  if (isFullReading) {
    fullReadingStreak++;
    emptyReadingStreak = 0;
  } else {
    emptyReadingStreak++;
    fullReadingStreak = 0;
  }

  if (!cabinetFull && fullReadingStreak >= ULTRASONIC_CONFIRM_COUNT) {
    cabinetFull = true;
    publishFullStatus(true);
  } else if (cabinetFull && emptyReadingStreak >= ULTRASONIC_CONFIRM_COUNT) {
    cabinetFull = false;
    publishFullStatus(false);
  }
}

void callback(char* topic, byte* payload, unsigned int length) {
  Serial.printf("\n[MQTT] Received on topic: %s\n", topic);

  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.printf("[JSON] Error: %s\n", err.c_str());
    return;
  }

  String msgType  = doc["type"].as<String>();
  String msgValue = doc["value"].as<String>();

  // แปลงให้เป็นตัวพิมพ์เล็กทั้งหมด
  msgType.toLowerCase();
  msgValue.toLowerCase();

  Serial.printf(">> Type: %s, Value: %s\n", msgType.c_str(), msgValue.c_str());

  // ----- LED -----
  if (msgType == "led") {
    if (msgValue == "on") {
      digitalWrite(LED_PIN, HIGH);
      Serial.println("[LED] ON");
    } else {
      digitalWrite(LED_PIN, LOW);
      Serial.println("[LED] OFF");
    }
  }

  // ----- MOTOR -----
  else if (msgType == "motor") {
    // ปรับความเร็วหากมีการส่งค่า speed มาด้วย
    if (doc.containsKey("speed")) {
      motorSpeed = constrain((int)doc["speed"], 0, 255);
    }

    if (msgValue == "open" || msgValue == "close" || msgValue == "dump") {
      // 0 = Dump (หดสุด), 1 = Open (ตรงกลาง), 2 = Close (ยืดสุด)
      if (msgValue == "dump") targetPos = 0;
      else if (msgValue == "open") targetPos = 1;
      else if (msgValue == "close") targetPos = 2;

      if (currentPos == targetPos) {
        Serial.println("[MOTOR] Already at target position. Ignoring.");
        return;
      }

      if (currentPos == -1) {
        // ปกติจะไม่เจอกรณีนี้แล้ว เพราะ calibrate ไปสุด Close ให้ตอนเปิดเครื่องแล้ว
        // เผื่อไว้เป็น fallback หลังสั่ง extend/retract/stop แบบแมนนวล
        motorRunDuration = MAX_DURATION;
        if (targetPos == 0) {
          motorBackward(motorSpeed);
          Serial.printf("[MOTOR] CALIBRATING to DUMP (Backward), Time=%dms\n", motorRunDuration);
        } else {
          motorForward(motorSpeed);
          Serial.printf("[MOTOR] CALIBRATING to %s (Forward), Time=%dms\n", msgValue.c_str(), motorRunDuration);
        }
      } else {
        int diff = targetPos - currentPos;
        motorRunDuration = abs(diff) * STEP_DURATION;

        if (diff > 0) {
          motorForward(motorSpeed);
          Serial.printf("[MOTOR] MOVE to %s (Forward), Steps=%d, Time=%dms\n", msgValue.c_str(), diff, motorRunDuration);
        } else {
          motorBackward(motorSpeed);
          Serial.printf("[MOTOR] MOVE to %s (Backward), Steps=%d, Time=%dms\n", msgValue.c_str(), abs(diff), motorRunDuration);
        }
      }

      motorStartTime = millis();
      isMotorRunning = true;
      currentPos = targetPos; // Update position immediately
    }
    // คำสั่งแมนนวล: สูญเสียตำแหน่ง
    else if (msgValue.startsWith("extend") || msgValue.startsWith("retract")) {
      currentPos = -1; // Reset position state
      unsigned long duration = 20000; // เวลาทำงานสูงสุดแบบแมนนวลคือ 20 วินาที

      if (msgValue.startsWith("extend")) {
        motorForward(motorSpeed);
        Serial.printf("[MOTOR] EXTEND MANUAL (Forward) speed=%d, Time=%dms\n", motorSpeed, duration);
      } else {
        motorBackward(motorSpeed);
        Serial.printf("[MOTOR] RETRACT MANUAL (Backward) speed=%d, Time=%dms\n", motorSpeed, duration);
      }

      motorRunDuration = duration;
      motorStartTime = millis();
      isMotorRunning = true;
    }
    else if (msgValue.startsWith("stop")) {
      currentPos = -1; // Reset position state
      motorStop();
      isMotorRunning = false;
      Serial.println("[MOTOR] STOP (Manual)");
    }
  }
}

void reconnect() {
  Serial.print("[MQTT] Attempting connection...");
  String clientId = "ESP32Client-";
  clientId += String(random(0xffff), HEX);
  if (mqtt.connect(clientId.c_str())) {
    Serial.println(" connected");
    mqtt.subscribe("smartlibrary/esp32/control");
    publishFullStatus(cabinetFull); // ส่งสถานะตู้ปัจจุบันซ้ำ เผื่อ backend หลุด MQTT ไปช่วงที่ผ่านมา
    digitalWrite(LED_PIN, HIGH);
    delay(200);
    digitalWrite(LED_PIN, LOW);
  } else {
    Serial.print(" failed, rc=");
    Serial.print(mqtt.state());
    Serial.println(" try again in 5 seconds");
  }
}

void setup() {
  Serial.begin(115200);
  Serial2.begin(57600, SERIAL_8N1, RXD2, TXD2);

  Serial.printf("MAC Address: %s\n", WiFi.macAddress().c_str());

  // LED
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Ultrasonic (HC-SR04)
  pinMode(ULTRASONIC_TRIG_PIN, OUTPUT);
  pinMode(ULTRASONIC_ECHO_PIN, INPUT);
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);

  // Motor pins
  pinMode(MOTOR_RPWM, OUTPUT);
  pinMode(MOTOR_LPWM, OUTPUT);
  pinMode(MOTOR_EN, OUTPUT);
  digitalWrite(MOTOR_EN, HIGH); // เปิดใช้งาน driver ตลอดเวลา

  motorStop(); // ตั้งต้นหยุดก่อน

  // Calibrate ตำแหน่งมอเตอร์ทุกครั้งที่เปิดเครื่อง: เดินหน้าสุดไป Close (ยืดสุด) เป็นจุดอ้างอิง
  Serial.println("[MOTOR] Calibrating to CLOSE on boot...");
  motorForward(motorSpeed);
  delay(MAX_DURATION);
  motorStop();
  currentPos = 2; // Close (ยืดสุด)
  Serial.println("[MOTOR] Calibration done, at CLOSE");

  WiFi.mode(WIFI_STA);

  Serial.printf("WiFi SSID: %s ", WIFI_SSID);
  Serial.printf("Connecting to Router: %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long connectStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - connectStart < 10000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[OK] Internet Connected! IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("[WARN] Internet NOT connected (จะลองเชื่อมต่อใหม่เรื่อยๆ ระหว่างทำงาน)");
  }

  Serial.printf("MQTT Server: %s:%d\n", MQTT_SERVER, MQTT_PORT);
  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  mqtt.setCallback(callback);

  Serial.println("--- RFID + Motor + MQTT ready ---");
}

void loop() {
  unsigned long currentTime = millis();

  if (WiFi.status() != WL_CONNECTED) {
    if (currentTime - lastWifiRetryTime > 30000 || lastWifiRetryTime == 0) {
      lastWifiRetryTime = currentTime;
      Serial.printf("[WiFi] Reconnecting... SSID: %s  Password: %s\n", WIFI_SSID, WIFI_PASSWORD);
      WiFi.reconnect();
    }
  } else if (!mqtt.connected()) {
    if (currentTime - lastMqttReconnectAttempt > 5000 || lastMqttReconnectAttempt == 0) {
      lastMqttReconnectAttempt = currentTime;
      reconnect();
    }
  } else {
    mqtt.loop();
  }

  // mqtt.loop() อาจเรียก callback() ซึ่งตั้ง motorStartTime = millis() ใหม่ระหว่างลูปนี้
  // ต้องอ่านเวลาปัจจุบันซ้ำอีกครั้งหลังจากนั้น ไม่งั้น currentTime (เก่ากว่า) - motorStartTime (ใหม่กว่า)
  // จะ underflow บน unsigned long กลายเป็นเลขมหาศาล ทำให้เข้าใจว่าหมดเวลาแล้วทันที
  currentTime = millis();

  // --- 0. ตรวจสอบและหยุดมอเตอร์อัตโนมัติเมื่อครบเวลา ---
  if (isMotorRunning && (currentTime - motorStartTime >= motorRunDuration)) {
    motorStop();
    isMotorRunning = false;
    Serial.println("[MOTOR] Auto-stopped by timer");
  }

  // --- 0.5 ตรวจจับตู้เต็มด้วย Ultrasonic (ไม่บล็อก เช็คทุก ULTRASONIC_CHECK_INTERVAL) ---
  if (currentTime - lastUltrasonicCheck >= ULTRASONIC_CHECK_INTERVAL) {
    lastUltrasonicCheck = currentTime;
    checkCabinetFull();
  }

  // --- 1. อ่านข้อมูลดิบจาก RFID reader เข้าถังพัก ---
  while (Serial2.available()) {
    byte b = Serial2.read();
    if (isprint(b) && b != ' ' && b != '.') {
      rawBuffer += (char)b;
    }
    lastReceiveTime = currentTime;
  }

  // --- 2. แยกรหัสหนังสือ 8 หลักเมื่อ reader หยุดส่ง ---
  if (rawBuffer.length() > 0 && (currentTime - lastReceiveTime > timeoutGap)) {
    int currentIndex = 0;
    int bufferLen = rawBuffer.length();

    while (currentIndex <= (bufferLen - 8)) {
      String cleanBarcode = rawBuffer.substring(currentIndex, currentIndex + 8);

      if (!isCollecting) {
        isCollecting = true;
        firstScanTime = currentTime;
        bookCount = 0;
        for (int i = 0; i < MAX_BOOKS; i++) collectedBooks[i] = "";
      }

      bool isDuplicate = false;
      for (int i = 0; i < bookCount; i++) {
        if (collectedBooks[i] == cleanBarcode) { isDuplicate = true; break; }
      }

      if (!isDuplicate && bookCount < MAX_BOOKS) {
        collectedBooks[bookCount++] = cleanBarcode;
      }

      currentIndex += 8;
    }
    rawBuffer = "";
  }

  // --- 3. เมื่อครบหน้าต่าง 2 วินาที ส่งรายการหนังสือไป MQTT ---
  if (isCollecting && (currentTime - firstScanTime >= COLLECTION_WINDOW)) {
    if (bookCount > 0) {
      StaticJsonDocument<512> doc;
      doc["type"] = "rfid";

      String combinedBooks = "";
      for (int i = 0; i < bookCount; i++) {
        if (i > 0) combinedBooks += ",";
        combinedBooks += collectedBooks[i];
      }
      doc["value"] = combinedBooks;

      char payload[512];
      serializeJson(doc, payload);

      mqtt.publish("smartlibrary/esp32/rfid", payload);
      Serial.printf("[RFID] Published: %s\n", payload);
    }
    isCollecting = false;
  }
}
