#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "secrets.h"

// ===== WiFi & MQTT =====
const int   MQTT_PORT     = 1883;

// ===== Static IP (วง Hotspot มือถือ "P-Hot" 10.239.123.x — เปลี่ยนจาก 172.19.128.x เพราะมือถืออัปเดต
// แล้วแจก subnet ใหม่ ไม่ใช่เครือข่ายอื่น) =====
// กัน IP เปลี่ยนไปมาเวลา DHCP แจกใหม่ — ถ้าเปลี่ยนไปใช้ Hotspot/เครือข่ายอื่น ต้องแก้เลขพวกนี้ให้ตรงกับ
// subnet ใหม่ด้วย (เช็คจาก Default Gateway/Subnet Mask ตอนคอม server ต่อเครือข่ายนั้นๆ)
IPAddress STATIC_IP(10, 239, 123, 101);
IPAddress GATEWAY_IP(10, 239, 123, 98); // ยืนยันจาก ipconfig จริงบน hotspot "P-Hot" (subnet เปลี่ยนเองตอนเปิด-ปิด hotspot ใหม่)
IPAddress SUBNET_MASK(255, 255, 255, 0);
IPAddress DNS1_IP(10, 239, 123, 98);
IPAddress DNS2_IP(8, 8, 8, 8);

// ===== RFID (Serial2) =====
#define RXD2 16
#define TXD2 17
#define MAX_BOOKS 10
const unsigned long COLLECTION_WINDOW = 2000;

// โครงสร้าง frame ของ reader SID_U861 (โหมด Active + Output: RS232/RS485 Output) ที่ยืนยันแล้วจาก
// การจับ raw byte ด้วย demo software ของ reader เอง:
//   13 00 EE 00 [data ยาวตาม Read Word Number*2 byte: 00 + รหัสหนังสือ(ASCII) + 0x0D + null padding] [checksum 2 byte]
// ต้องอ่านตามตำแหน่ง/ความยาวที่รู้แน่นอนแบบนี้ ไม่ใช่กรองเอาแต่ตัวอักษรพิมพ์ได้มารวมกันเฉยๆ เพราะ
// checksum ท้าย frame เป็นค่าที่ขึ้นกับข้อมูล มีโอกาสสุ่มออกมาเป็นตัวอักษร/ตัวเลขปกติได้ ถ้ากรองแบบเดิม
// จะหลุดไปปนเป็นตัวหน้าของรหัสเล่มถัดไปโดยไม่รู้ตัว
//
// RFID_READ_WORD_NUMBER ต้องตรงกับค่า "Read Word Number" ที่ตั้งไว้ในหน้า Reader Parameter ของ reader
// เสมอ (ตอนนี้ตั้งไว้ 7 words = 14 byte เพราะรหัสหนังสือยาวสุดในฐานข้อมูลจริงคือ 13 ตัวอักษร) ถ้าไปแก้
// ค่านี้ที่ตัว reader อีก ต้องมาแก้เลขตรงนี้ให้ตรงกันด้วย ไม่งั้น frame จะยาวไม่ตรงกับที่โค้ดคาดไว้
const byte RFID_FRAME_HEAD       = 0x13;
const byte RFID_FRAME_CMD_REPORT = 0xEE; // คำสั่งรายงานข้อมูลแท็ก (byte ที่ 3 ของ header)
const int  RFID_HEADER_LEN       = 3;    // Head(1) + Address(1) + Command(1)
const int  RFID_READ_WORD_NUMBER = 7;
const int  RFID_DATA_LEN         = RFID_READ_WORD_NUMBER * 2;
const int  RFID_CHECKSUM_LEN     = 2;
const int  RFID_FRAME_LEN        = RFID_HEADER_LEN + RFID_DATA_LEN + RFID_CHECKSUM_LEN;

byte frameBuf[RFID_FRAME_LEN];
int  frameIdx = 0;

String collectedBooks[MAX_BOOKS];
int bookCount = 0;
unsigned long firstScanTime = 0;
bool isCollecting = false;
unsigned long lastReceiveTime = 0;
const unsigned long timeoutGap = 25;

// ===== LED =====
#define LED_PIN 2

// ===== Ultrasonic (HC-SR04) ตรวจจับตู้เต็ม =====
#define ULTRASONIC_TRIG_PIN 12
#define ULTRASONIC_ECHO_PIN 13
const int ULTRASONIC_FULL_DISTANCE_CM = 70;      // ระยะที่ถือว่าตู้เต็ม (ปรับตามตำแหน่งติดตั้งจริง)
const unsigned long ULTRASONIC_CHECK_INTERVAL = 1000; // เช็คระยะทุก 1 วินาที
const int ULTRASONIC_CONFIRM_COUNT = 3;          // ต้องอ่านค่าเข้าเงื่อนไขติดกันกี่ครั้งก่อนยืนยันเปลี่ยนสถานะ (กันค่าอ่านเพี้ยน/หนังสือขยับผ่าน)
// ตอนสั่ง Dump หนังสือจะตกผ่านหน้าเซนเซอร์ชั่วขณะ ทำให้อ่านระยะใกล้ผิดพลาดจนเข้าเงื่อนไข "เต็ม" หลอกๆ
// ได้ (เจอจริงจาก log: ขึ้นเต็มแค่ 3-4 วินาทีตอนเทหนังสือแล้วหายไปเอง) จึงพักการเช็คไว้ช่วงที่มอเตอร์
// กำลังหด + เวลาให้หนังสือตกตั้งตัวก่อน ค่อยกลับมาเช็คสถานะจริงอีกที — ใช้เป็นค่าเริ่มต้นเฉยๆ ตอนนี้
// (ค่าจริงที่ใช้งานมาจากคำสั่ง dump แต่ละครั้งที่ backend ส่งมาพร้อม field "settle_ms" ตั้งได้จาก
// หน้า Dashboard แทน กันค่าคนละที่ไม่ตรงกัน)
const unsigned long DEFAULT_ULTRASONIC_DUMP_SETTLE_MS = 5000;

unsigned long lastUltrasonicCheck = 0;
unsigned long ultrasonicSuppressUntil = 0;
bool cabinetFull = false;
int fullReadingStreak = 0;
int emptyReadingStreak = 0;

// ===== BTS7960 Motor Driver (1 มอเตอร์) =====
#define MOTOR_RPWM 26
#define MOTOR_LPWM 25
#define MOTOR_EN   27 // R_EN และ L_EN มัดรวมกัน

int motorSpeed = 255; // ความเร็วสูงสุด (0–255)

// ตั้งค่าระยะเวลาทำงานของมอเตอร์ (ค่าคงที่) — คำนวณจากระยะชัก (stroke) 200mm ของแกนชักตัวจริง
// ไม่เปลี่ยน แต่เปลี่ยนไปใช้มอเตอร์ตัวใหม่ที่ความเร็ว 96mm/s (เดิม ~10mm/s)
// 1 ช่วง = ครึ่งระยะชัก = 100mm ÷ 96mm/s = 1041.67ms, 2 ช่วงเต็ม = 200mm ÷ 96mm/s = 2083.33ms
const unsigned long STEP_DURATION = 1042; // เวลาสำหรับ 1 ช่วง (เช่น จาก Dump -> Open หรือ Open -> Close)
const unsigned long MAX_DURATION = 2084;  // เวลาสูงสุด (2 ช่วง: หดสุดไปยืดสุด)

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

// ไฟกะพริบตอน boot: กะพริบจนกว่าจะต่อ MQTT server สำเร็จครั้งแรก แล้วดับค้างไว้
bool bootLedBlinking = true;
bool bootLedState = false;
unsigned long lastBootBlinkToggle = 0;

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

// เรียกซ้ำๆ ได้ทั้งใน setup() (ระหว่าง delay แบบ chunk) และ loop() เพื่อกะพริบไฟแบบไม่บล็อก
void bootBlinkTick() {
  if (!bootLedBlinking) return;
  unsigned long now = millis();
  if (now - lastBootBlinkToggle >= 200) {
    lastBootBlinkToggle = now;
    bootLedState = !bootLedState;
    digitalWrite(LED_PIN, bootLedState ? HIGH : LOW);
  }
}

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
  if (millis() < ultrasonicSuppressUntil) return; // พักเช็คช่วงเทหนังสือ (ดูคอมเมนต์ที่ DEFAULT_ULTRASONIC_DUMP_SETTLE_MS)

  long dist = readUltrasonicDistanceCm();
  if (dist < 0) return; // อ่านค่าไม่ได้ในรอบนี้ ข้ามไปก่อน

  bool isFullReading = dist <= ULTRASONIC_FULL_DISTANCE_CM;
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

      if (targetPos == 0) {
        // สั่ง Dump — พักการเช็คตู้เต็มไว้จนกว่ามอเตอร์จะหดสุด + เวลาให้หนังสือตกตั้งตัว (กันอ่านค่าเพี้ยน)
        // ใช้ค่า settle_ms ที่ backend ส่งมาพร้อมคำสั่ง (ตั้งได้จากหน้า Dashboard) ถ้าไม่ได้ส่งมาด้วย
        // (เช่นคำสั่งเก่าจาก backend เวอร์ชันก่อนหน้า) ใช้ค่าเริ่มต้นแทน
        unsigned long settleMs = DEFAULT_ULTRASONIC_DUMP_SETTLE_MS;
        if (doc.containsKey("settle_ms")) {
          settleMs = (unsigned long)(int)doc["settle_ms"];
        }
        ultrasonicSuppressUntil = millis() + motorRunDuration + settleMs;
        fullReadingStreak = 0;
        emptyReadingStreak = 0;
      }

      motorStartTime = millis();
      isMotorRunning = true;
      currentPos = targetPos; // Update position immediately
    }
    // คำสั่งแมนนวล: สูญเสียตำแหน่ง
    else if (msgValue.startsWith("extend") || msgValue.startsWith("retract")) {
      currentPos = -1; // Reset position state
      unsigned long duration = MAX_DURATION; // เวลาทำงานสูงสุดแบบแมนนวล = เวลาวิ่งเต็มระยะชัก

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

// ใช้ Last Will/Testament บอก backend ว่า ESP32 นี้หลุดการเชื่อมต่อ (ไม่ว่าจะปิดเครื่อง/สัญญาณหลุด/ค้าง)
// broker จะส่ง willMessage นี้ให้ผู้ subscribe topic เดียวกันเองอัตโนมัติทันทีที่ตรวจพบว่า client หลุด
// (retain=true กันเหตุ backend restart พลาดข้อความไปตอนที่ ESP32 หลุดไปก่อนแล้ว จะอ่านค่าล่าสุดได้ทันทีที่ subscribe ใหม่)
const char* STATUS_TOPIC = "smartlibrary/esp32/status";

void reconnect() {
  Serial.print("[MQTT] Attempting connection...");
  String clientId = "ESP32Client-";
  clientId += String(random(0xffff), HEX);
  if (mqtt.connect(clientId.c_str(), STATUS_TOPIC, 0, true, "offline")) {
    Serial.println(" connected");
    mqtt.subscribe("smartlibrary/esp32/control");
    mqtt.publish(STATUS_TOPIC, "online", true); // บอก backend ว่าออนไลน์แล้ว (retain ไว้เหมือนกัน)
    publishFullStatus(cabinetFull); // ส่งสถานะตู้ปัจจุบันซ้ำ เผื่อ backend หลุด MQTT ไปช่วงที่ผ่านมา
    bootLedBlinking = false; // ต่อ server สำเร็จครั้งแรกแล้ว หยุดกะพริบไฟบอกสถานะ boot ถาวร
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
  unsigned long calStart = millis();
  while (millis() - calStart < MAX_DURATION) {
    bootBlinkTick();
    delay(10);
  }
  motorStop();
  currentPos = 2; // Close (ยืดสุด)
  Serial.println("[MOTOR] Calibration done, at CLOSE");

  WiFi.mode(WIFI_STA);

  // ตั้ง static IP ก่อน begin() เสมอ กัน DHCP แจก IP ใหม่ไปมา (ต้องตรงกับ subnet ของเครือข่ายที่ใช้จริง)
  if (!WiFi.config(STATIC_IP, GATEWAY_IP, SUBNET_MASK, DNS1_IP, DNS2_IP)) {
    Serial.println("[WiFi] ตั้ง static IP ไม่สำเร็จ");
  }

  Serial.printf("WiFi SSID: %s ", WIFI_SSID);
  Serial.printf("Connecting to Router: %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long connectStart = millis();
  unsigned long lastDot = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - connectStart < 10000) {
    bootBlinkTick();
    if (millis() - lastDot >= 500) {
      lastDot = millis();
      Serial.print(".");
    }
    delay(10);
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
  // ลด keepalive จาก default 15 วินาทีเหลือ 5 วินาที — สงสัยว่า NAT ของ hotspot มือถือ timeout
  // connection ที่ "เงียบ" เร็วกว่า 15 วินาที ทำให้หลุดก่อนที่จะได้ส่ง ping รอบถัดไป ลองส่งถี่ขึ้นดูก่อน
  mqtt.setKeepAlive(5);

  Serial.println("--- RFID + Motor + MQTT ready ---");
}

void loop() {
  unsigned long currentTime = millis();

  bootBlinkTick(); // กะพริบไฟต่อเนื่องจนกว่าจะต่อ MQTT server สำเร็จครั้งแรก (ไม่บล็อก)

  if (WiFi.status() != WL_CONNECTED) {
    if (currentTime - lastWifiRetryTime > 30000 || lastWifiRetryTime == 0) {
      lastWifiRetryTime = currentTime;
      Serial.printf("[WiFi] Reconnecting... SSID: %s\n", WIFI_SSID);
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

  // --- 1. อ่านข้อมูลดิบจาก RFID reader ทีละไบต์ ประกอบเป็น frame ตามโครงสร้างที่รู้แน่นอนแล้ว
  //     (sync ด้วย Head=0x13, ความยาว frame คงที่ตาม RFID_FRAME_LEN) แทนการกรองเอาตัวพิมพ์ได้มา
  //     รวมกันเฉยๆ เพราะ checksum ท้าย frame มีโอกาสสุ่มออกมาเป็นตัวพิมพ์ได้ ถ้ากรองแบบนั้นจะเสี่ยง
  //     หลุดไปปนเป็นตัวหน้าของรหัสเล่มถัดไป
  while (Serial2.available()) {
    byte b = Serial2.read();
    lastReceiveTime = currentTime;

    if (frameIdx == 0 && b != RFID_FRAME_HEAD) {
      continue; // ยังไม่เจอจุดเริ่ม frame ข้ามไปเรื่อยๆ จนกว่าจะเจอ Head
    }
    frameBuf[frameIdx++] = b;

    if (frameIdx >= RFID_FRAME_LEN) {
      // ได้ frame ครบแล้ว เช็ค Command ให้แน่ใจว่าเป็น frame รายงานแท็กจริงก่อนค่อยดึงข้อมูล
      if (frameBuf[2] == RFID_FRAME_CMD_REPORT) {
        String code = "";
        for (int i = RFID_HEADER_LEN; i < RFID_HEADER_LEN + RFID_DATA_LEN; i++) {
          byte db = frameBuf[i];
          if (db == 0x0D) break;        // เจอตัวจบรหัสในข้อมูล หยุดอ่านต่อ
          if (isprint(db)) code += (char)db; // ข้าม null/byte นำหน้าที่ไม่ใช่ตัวพิมพ์ได้
        }

        if (code.length() > 0) {
          if (!isCollecting) {
            isCollecting = true;
            firstScanTime = currentTime;
            bookCount = 0;
            for (int i = 0; i < MAX_BOOKS; i++) collectedBooks[i] = "";
          }

          bool isDuplicate = false;
          for (int i = 0; i < bookCount; i++) {
            if (collectedBooks[i] == code) { isDuplicate = true; break; }
          }
          if (!isDuplicate && bookCount < MAX_BOOKS) {
            collectedBooks[bookCount++] = code;
          }
        }
      }
      frameIdx = 0; // พร้อมรับ frame ถัดไป
    }
  }

  // --- 2. ถ้าเริ่มรับ frame แล้วค้างกลางคันนานเกินไป (byte หลุดหาย/สัญญาณรบกวน) ให้รีเซ็ตทิ้ง กัน sync เพี้ยน
  if (frameIdx > 0 && (currentTime - lastReceiveTime > timeoutGap)) {
    frameIdx = 0;
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
