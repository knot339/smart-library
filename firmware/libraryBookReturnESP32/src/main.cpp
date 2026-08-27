#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ===== WiFi & MQTT =====
const char* WIFI_SSID     = "P-Hot";
const char* WIFI_PASSWORD = "12345678";
const char* MQTT_SERVER   = "10.111.86.90";
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
  while (!mqtt.connected()) {
    Serial.print("[MQTT] Attempting connection...");
    String clientId = "ESP32Client-";
    clientId += String(random(0xffff), HEX);
    if (mqtt.connect(clientId.c_str())) {
      Serial.println(" connected");
      mqtt.subscribe("smartlibrary/esp32/control");
      digitalWrite(LED_PIN, HIGH);
      delay(200);
      digitalWrite(LED_PIN, LOW);
    } else {
      Serial.print(" failed, rc=");
      Serial.print(mqtt.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  Serial2.begin(57600, SERIAL_8N1, RXD2, TXD2);

  // LED
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Motor pins
  pinMode(MOTOR_RPWM, OUTPUT);
  pinMode(MOTOR_LPWM, OUTPUT);
  pinMode(MOTOR_EN, OUTPUT);
  digitalWrite(MOTOR_EN, HIGH); // เปิดใช้งาน driver ตลอดเวลา

  motorStop(); // ตั้งต้นหยุดก่อน

  // WiFi
  Serial.printf("Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\nWiFi Connected! IP: %s\n", WiFi.localIP().toString().c_str());

  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  mqtt.setCallback(callback);

  Serial.println("--- RFID + Motor + MQTT ready ---");
}

void loop() {
  if (!mqtt.connected()) {
    reconnect();
  }
  mqtt.loop();

  unsigned long currentTime = millis();

  // --- 0. ตรวจสอบและหยุดมอเตอร์อัตโนมัติเมื่อครบเวลา ---
  if (isMotorRunning && (currentTime - motorStartTime >= motorRunDuration)) {
    motorStop();
    isMotorRunning = false;
    Serial.println("[MOTOR] Auto-stopped by timer");
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
