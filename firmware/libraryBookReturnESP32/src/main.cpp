#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ===== WiFi & MQTT =====
const char* WIFI_SSID     = "P-Hot";
const char* WIFI_PASSWORD = "12345678";
const char* MQTT_SERVER   = "10.147.169.90";
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

// ===== L298N Motor Driver (1 มอเตอร์) =====
#define MOTOR_IN1 25
#define MOTOR_IN2 26
#define MOTOR_ENA 27

int motorSpeed = 200; // ความเร็วเริ่มต้น (0–255)

// ตั้งค่าระยะเวลาทำงานของมอเตอร์ 
const unsigned long OPEN_DURATION = 5000;  // เวลาในการเปิดฝาตู้
const unsigned long CLOSE_DURATION = 5000; // เวลาในการปิดฝาตู้
const unsigned long DUMP_DURATION = 5000;  // เวลาในการเทหนังสือ

// ตัวแปรจับเวลาสำหรับหยุดมอเตอร์
unsigned long motorStartTime = 0;
unsigned long motorRunDuration = 0;
bool isMotorRunning = false;

// ----- ฟังก์ชันควบคุมมอเตอร์ -----
void motorStop() {
  analogWrite(MOTOR_ENA, 0);
  digitalWrite(MOTOR_IN1, LOW);
  digitalWrite(MOTOR_IN2, LOW);
}

void motorForward(int spd) {
  digitalWrite(MOTOR_IN1, HIGH);
  digitalWrite(MOTOR_IN2, LOW);
  analogWrite(MOTOR_ENA, spd);
}

void motorBackward(int spd) {
  digitalWrite(MOTOR_IN1, LOW);
  digitalWrite(MOTOR_IN2, HIGH);
  analogWrite(MOTOR_ENA, spd);
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

    if (msgValue == "open") { 
      motorForward(motorSpeed);  
      motorRunDuration = OPEN_DURATION;
      motorStartTime = millis();
      isMotorRunning = true;
      Serial.printf("[MOTOR] OPEN (Forward) speed=%d, Time=%dms\n", motorSpeed, OPEN_DURATION); 
    }
    else if (msgValue == "close") { 
      motorBackward(motorSpeed); 
      motorRunDuration = CLOSE_DURATION;
      motorStartTime = millis();
      isMotorRunning = true;
      Serial.printf("[MOTOR] CLOSE (Backward) speed=%d, Time=%dms\n", motorSpeed, CLOSE_DURATION); 
    }
    else if (msgValue == "dump") {
      // เทหนังสือ (สมมติว่าเป็นการหมุนเดินหน้าเช่นเดียวกับเปิด แต่อาจจะใช้เวลานานกว่า)
      motorForward(motorSpeed); 
      motorRunDuration = DUMP_DURATION;
      motorStartTime = millis();
      isMotorRunning = true;
      Serial.printf("[MOTOR] DUMP speed=%d, Time=%dms\n", motorSpeed, DUMP_DURATION);
    }
    else if (msgValue == "stop") { 
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
  pinMode(MOTOR_IN1, OUTPUT);
  pinMode(MOTOR_IN2, OUTPUT);
  pinMode(MOTOR_ENA, OUTPUT);

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
