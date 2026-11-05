#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ===== WiFi & MQTT & ตัวตนของตู้ =====
// ไม่ hardcode WiFi SSID/Password, IP, และ MQTT server อีกต่อไป (เลิกใช้ secrets.h/static IP) — ตั้งค่า
// ผ่านหน้าเว็บ WiFiManager ตอนเปิดเครื่องครั้งแรกแทนทั้งหมด แล้วจำไว้ใน flash (Preferences/NVS) ถาวร
// ไม่ต้อง flash ใหม่ทุกครั้งที่ย้ายเครือข่าย/เปลี่ยนตู้ที่ติดตั้ง
const int MQTT_PORT = 1883;

Preferences prefs;
String cabinetID;    // รหัสตู้ที่ผู้ติดตั้งตั้งเองผ่านพอร์ทัล (เช่น "cabinet-1") ใช้แบ่ง MQTT topic ของแต่ละตู้
String serverHost;   // host ของเครื่อง backend/MQTT broker (แยกจาก port ด้วย ':' ตอนกรอกในพอร์ทัล)
int    serverPort = MQTT_PORT;

// สร้าง topic string ของตู้นี้ไว้ใช้ซ้ำทั้งไฟล์ (ต้องรอรู้ cabinetID ก่อน จึงประกอบค่าจริงใน setup())
String TOPIC_CONTROL;
String TOPIC_RFID;
String TOPIC_FULL;
String TOPIC_STATUS;

// ย้ายมาประกาศเป็น global ตรงนี้ (เดิมอยู่ถัดลงไปหลัง bootBlinkTick) เพราะ onParamsSaved() ที่ประกาศ
// ก่อนหน้าโค้ดส่วนอื่นด้านล่าง ต้องใช้ mqtt ด้วย (สั่ง disconnect ให้ reconnect ใหม่ตอนมีคนแก้ค่าผ่านพอร์ทัล)
WiFiClient espClient;
PubSubClient mqtt(espClient);

// ปุ่ม Factory Reset (กดค้างตอนเปิดเครื่อง) — ล้างค่า WiFi/Cabinet ID/Server ที่บันทึกไว้ทั้งหมด แล้ว
// เปิดพอร์ทัลตั้งค่าใหม่ ใช้ตอนจะย้ายบอร์ดนี้ไปตั้งเป็นตู้อื่น/เครือข่ายอื่น โดยไม่ต้อง flash ใหม่
// ขาที่ยังว่างอยู่บนบอร์ด — ถ้ายังไม่ได้ต่อปุ่มจริง ขานี้จะลอยที่ HIGH ตามค่า pull-up ภายในเสมอ ไม่กระทบ
// การทำงานปกติ
#define FACTORY_RESET_PIN 5

// รหัสผ่าน AP ตั้งค่า "SmartLibrary-Setup" — ต้องยาวอย่างน้อย 8 ตัวอักษร (ข้อกำหนด WPA2) กันคนแปลกหน้า
// ที่อยู่ในระยะสัญญาณเชื่อมต่อเข้ามาแก้ WiFi/Server ของตู้โดยไม่ได้รับอนุญาต (จากเดิมเปิดเป็น AP สาธารณะ)
const char* AP_PASSWORD = "libraryPass";

// wm, customCabinetID, customServerAddr เป็น global (ไม่ใช่ local ในฟังก์ชันตั้งค่า) เพราะ WiFiManager
// เก็บ pointer ไปยัง customCabinetID/customServerAddr ไว้ใช้ตอนวาดหน้าเว็บ ถ้าเป็นตัวแปร local มันจะถูก
// ทำลายทิ้งทันทีที่ฟังก์ชันตั้งค่า return แต่ wm ยังมีชีวิตต่อเพื่อเปิดพอร์ทัลพื้นหลัง (startWebPortal)
// ตลอดการทำงาน จะเหลือ pointer ที่ชี้ไปยัง memory ที่ถูกทำลายไปแล้ว (dangling pointer)
WiFiManager wm;
WiFiManagerParameter* customCabinetID = nullptr;
WiFiManagerParameter* customServerAddr = nullptr;

// แยก parse "host:port" ออกมาเป็นฟังก์ชันกลาง ใช้ร่วมกันทั้งตอน setup ครั้งแรก (setupWiFiAndIdentity)
// และตอนมีคนแก้ผ่านพอร์ทัลพื้นหลังทีหลัง (onParamsSaved) กัน logic ซ้ำกันสองที่แล้วแก้ไม่ครบ
// ถ้า parse ได้ host ที่ไม่ว่างเปล่า จะอัปเดต serverHost/serverPort (global) แล้วคืน true ถ้าไม่ได้ (เช่น
// กรอกว่างไว้ หรือกรอกแค่ ":1883" ไม่มี host) จะไม่แก้ serverHost/serverPort เดิมเลย แล้วคืน false —
// กันบั๊กที่เจอจริง: ของเดิมเช็คแค่ colonIdx > 0 พลาดเคส host ว่าง (colonIdx==0) ทำให้ค่าพังพอกทุกรอบบูต
bool parseServerAddr(String input) {
  input.trim();
  if (input.length() == 0) return false;
  int colonIdx = input.indexOf(':');
  String hostPart = (colonIdx >= 0) ? input.substring(0, colonIdx) : input;
  hostPart.trim();
  if (hostPart.length() == 0) return false;
  serverHost = hostPart;
  if (colonIdx >= 0) {
    int parsedPort = input.substring(colonIdx + 1).toInt();
    serverPort = (parsedPort > 0) ? parsedPort : MQTT_PORT;
  } else {
    serverPort = MQTT_PORT;
  }
  return true;
}

// เรียกทุกครั้งที่มีคนกดเซฟหน้าตั้งค่า WiFiManager ไม่ว่าจะเป็นตอน setup ครั้งแรก, ตอนบังคับเปิดพอร์ทัล
// ใหม่ด้วยปุ่ม Factory Reset, หรือเข้าไปแก้ผ่านพอร์ทัลพื้นหลังตอนต่อเน็ตปกติอยู่ก็ตาม
//
// ห้าม ESP.restart() ในฟังก์ชันนี้โดยเด็ดขาด — ฟอร์ม WiFi กับฟอร์มรหัสตู้/Server อยู่หน้าเดียวกัน
// (_paramsInWifi) การเซฟ param (ที่ทำให้ callback นี้ถูกเรียก) เกิดขึ้น "ก่อน" ที่ WiFiManager จะเริ่ม
// ลองต่อ/บันทึก WiFi ใหม่จริงๆ (ฟังก์ชัน connectWifi() ภายในยังไม่ถูกเรียก ณ จุดนี้) ถ้า restart ไปก่อน
// ตรงนี้ WiFi ใหม่ที่กรอกจะไม่ถูกบันทึกลง flash เลย บูตรอบหน้าจะย้อนกลับไปต่อ WiFi เดิมเหมือนไม่มีอะไร
// เปลี่ยน (บั๊กที่เจอจริงจากการทดสอบ: เปลี่ยน WiFi แล้วค่าไม่เปลี่ยน) ต้องปล่อยให้โค้ดกลับไปทำงานต่อตาม
// ปกติ แล้วแค่ apply รหัสตู้/server ใหม่สดๆตรงนี้แทน ไม่ต้อง restart เครื่องเลย
void onParamsSaved() {
  String newCabinetID = String(customCabinetID->getValue());
  newCabinetID.trim();
  if (newCabinetID.length() == 0) newCabinetID = "cabinet-1";
  cabinetID = newCabinetID;
  prefs.putString("cabinet_id", cabinetID);

  String newServerAddr = String(customServerAddr->getValue());
  if (parseServerAddr(newServerAddr)) {
    prefs.putString("server_addr", serverHost + ":" + String(serverPort));
  } else {
    Serial.println("[SETUP] ช่อง Server Address ว่างเปล่า/ไม่ถูกต้อง — คงค่า server เดิมไว้ก่อน");
  }

  TOPIC_CONTROL = "smartlibrary/" + cabinetID + "/control";
  TOPIC_RFID    = "smartlibrary/" + cabinetID + "/rfid";
  TOPIC_FULL    = "smartlibrary/" + cabinetID + "/full";
  TOPIC_STATUS  = "smartlibrary/" + cabinetID + "/status";

  mqtt.setServer(serverHost.c_str(), serverPort);
  mqtt.disconnect(); // ตัดการเชื่อมต่อเดิม ให้ reconnect() ใน loop() ต่อ MQTT ใหม่ด้วยค่า/topic ล่าสุดเอง

  Serial.printf("[SETUP] บันทึกค่าใหม่แล้ว (ไม่ restart เครื่อง) — รหัสตู้: %s, Server: %s:%d\n",
                cabinetID.c_str(), serverHost.c_str(), serverPort);
}

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

// ===== เครื่องสแกนบาร์โค้ด (บัตรนักศึกษา/ตัวตน) — UART1 แยกคนละชุดกับ RFID หนังสือด้านบน (Serial2) =====
// ขาที่ยังว่างอยู่บนบอร์ดนี้ (ไม่ชนกับ RFID/LED/Ultrasonic/Motor/กลอนไฟฟ้าด้านบน) — ตัวสแกนเนอร์ส่ง
// ข้อความมาเป็นบรรทัดเดียวจบ (CR/LF ท้ายข้อความ) ไม่ต้องรวบรวมหลายรายการเหมือน RFID หนังสือ
#define BARCODE_RXD 18
#define BARCODE_TXD 19
const unsigned long BARCODE_IDLE_GAP_MS = 50; // ไม่มีไบต์ใหม่เข้ามานานเท่านี้ถือว่าสแกนจบ 1 รอบแล้ว

String barcodeBuffer = "";
unsigned long barcodeLastByteTime = 0;
bool barcodeReceiving = false;

// ===== LED =====
#define LED_PIN 2

// ===== กลอนไฟฟ้าล็อกตู้ (รีเลย์ Active-LOW) — คนละตัวกับมอเตอร์แกนชักที่รับหนังสือ ใช้ล็อก/ปลดล็อกฝาตู้ทั้งบาน =====
// ขาที่ยังว่างอยู่บนบอร์ดนี้ (ไม่ชนกับ RFID/LED/Ultrasonic/Motor ด้านบน)
#define LOCK_PIN 23

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

// ----- ฟังก์ชันควบคุมกลอนไฟฟ้าล็อกตู้ -----
// โมดูลรีเลย์เป็นแบบ Active-LOW (ของจริงที่ใช้ — ส่งสัญญาณ LOW แล้วรีเลย์ถึงจะ trigger/ทำงาน)
void setLock(bool locked) {
  digitalWrite(LOCK_PIN, locked ? LOW : HIGH);
  Serial.printf("[LOCK] %s\n", locked ? "LOCK" : "UNLOCK");
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
  mqtt.publish(TOPIC_FULL.c_str(), payload);
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

// อ่านข้อมูลจากเครื่องสแกนบาร์โค้ด (บัตรนักศึกษา/ตัวตน) แบบไม่บล็อก — ตัวสแกนเนอร์ส่งมาเป็นบรรทัดเดียว
// จบในชุดเดียว ไม่ต้องรวบรวมหลายรายการแบบ RFID หนังสือ แค่รอจนไม่มีไบต์ใหม่เข้ามานาน BARCODE_IDLE_GAP_MS
// ก็ถือว่าสแกนจบแล้ว (เทียบเท่า Serial.setTimeout(50) ของโค้ดทดสอบเดิม แต่ไม่บล็อก loop() หลัก)
// ส่งไป MQTT topic เดียวกับ RFID หนังสือ (smartlibrary/esp32/rfid) เพราะ backend แค่ forward payload
// ดิบๆ ต่อให้ tablet โดยไม่สนใจชื่อ topic อยู่แล้ว — ฝั่ง tablet แยกแยะจาก field "type" ในตัว payload เอง
void readBarcodeScanner(unsigned long currentTime) {
  while (Serial1.available()) {
    char c = Serial1.read();
    barcodeBuffer += c;
    barcodeReceiving = true;
    barcodeLastByteTime = currentTime;
  }

  if (barcodeReceiving && (currentTime - barcodeLastByteTime >= BARCODE_IDLE_GAP_MS)) {
    barcodeBuffer.trim(); // ตัด \r \n ที่สแกนเนอร์ส่งมาท้ายข้อความ
    if (barcodeBuffer.length() > 0) {
      StaticJsonDocument<256> doc;
      doc["type"] = "barcode";
      doc["value"] = barcodeBuffer;

      char payload[256];
      serializeJson(doc, payload);

      mqtt.publish(TOPIC_RFID.c_str(), payload);
      Serial.printf("[BARCODE] Published: %s\n", payload);
    }
    barcodeBuffer = "";
    barcodeReceiving = false;
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

  // ----- กลอนไฟฟ้าล็อกตู้ -----
  if (msgType == "lock") {
    setLock(msgValue != "unlock"); // ค่าอื่นนอกจาก "unlock" ทั้งหมดถือเป็นสั่งล็อก (fail-secure)
  }

  // ----- LED -----
  else if (msgType == "led") {
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
// (TOPIC_STATUS ประกอบขึ้นจาก cabinetID ใน setup() ก่อนจะมีการเรียก reconnect() ครั้งแรกเสมอ)

void reconnect() {
  Serial.print("[MQTT] Attempting connection...");
  String clientId = "ESP32Client-";
  clientId += String(random(0xffff), HEX);
  if (mqtt.connect(clientId.c_str(), TOPIC_STATUS.c_str(), 0, true, "offline")) {
    Serial.println(" connected");
    mqtt.subscribe(TOPIC_CONTROL.c_str());
    mqtt.publish(TOPIC_STATUS.c_str(), "online", true); // บอก backend ว่าออนไลน์แล้ว (retain ไว้เหมือนกัน)
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

// ตั้งค่า WiFi + รหัสตู้ + Server ผ่าน WiFiManager — เรียกได้ทั้งตอนบูต (setup) และระหว่างเครื่องทำงาน
// ปกติ (loop, ตอนกดปุ่ม Factory Reset ค้าง 3 วิ) จึงแยกเป็นฟังก์ชันแทนการเขียนอยู่ใน setup() อย่างเดียว
// forcePortal = true  -> เปิดพอร์ทัล "SmartLibrary-Setup" ทันที (startConfigPortal) ไม่ว่าจะมีค่าที่
//                        บันทึกไว้อยู่แล้วหรือไม่ ใช้ตอนผู้ใช้ตั้งใจจะตั้งค่าใหม่
// forcePortal = false -> ลองต่อด้วยค่าที่บันทึกไว้ก่อน (autoConnect) เปิดพอร์ทัลเองอัตโนมัติถ้าต่อไม่ได้
//                        ใช้ตอนบูตปกติ
void setupWiFiAndIdentity(bool forcePortal) {
  // สร้าง parameter + ลงทะเบียน callback แค่ครั้งเดียวตลอดการทำงานของโปรแกรม — wm เป็น global ที่ค้างอยู่
  // ตลอด (เพื่อเปิดพอร์ทัลพื้นหลังด้วย startWebPortal ด้านล่าง) ถ้าเรียก addParameter ซ้ำทุกครั้งที่ฟังก์ชัน
  // นี้ถูกเรียก (เช่น ตอนกดปุ่มขอพอร์ทัลใหม่ระหว่างทำงาน) จะกลายเป็นช่องกรอกซ้ำพอกเพิ่มขึ้นเรื่อยๆบนหน้าเว็บ
  if (customCabinetID == nullptr) {
    String savedCabinetID = prefs.getString("cabinet_id", "");
    String savedServerAddr = prefs.getString("server_addr", "");

    customCabinetID = new WiFiManagerParameter("cabinet_id", "รหัสตู้ (เช่น cabinet-1)", savedCabinetID.c_str(), 40);
    customServerAddr = new WiFiManagerParameter("server_addr", "Server Address (host:port เช่น 192.168.1.10:1883)", savedServerAddr.c_str(), 60);
    wm.addParameter(customCabinetID);
    wm.addParameter(customServerAddr);
    wm.setSaveParamsCallback(onParamsSaved);
    wm.setConfigPortalTimeout(180);
  }

  bool wifiConnected;
  if (forcePortal) {
    Serial.println("[SETUP] เปิดพอร์ทัลตั้งค่า \"SmartLibrary-Setup\" ทันที...");
    wifiConnected = wm.startConfigPortal("SmartLibrary-Setup", AP_PASSWORD);
  } else {
    wifiConnected = wm.autoConnect("SmartLibrary-Setup", AP_PASSWORD);
  }

  if (!wifiConnected) {
    Serial.println("[WiFi] ต่อไม่สำเร็จ/timeout — รีสตาร์ทบอร์ดเพื่อลองใหม่");
    delay(3000);
    ESP.restart();
  }

  cabinetID = String(customCabinetID->getValue());
  cabinetID.trim();
  if (cabinetID.length() == 0) cabinetID = "cabinet-1"; // กันกรณีฟอร์มถูกส่งมาว่าง

  if (!parseServerAddr(String(customServerAddr->getValue()))) {
    Serial.println("[SETUP] ช่อง Server Address ว่างเปล่า/ไม่ถูกต้อง — คงค่า server เดิมไว้ก่อน");
  }

  // บันทึกค่าลง flash ถาวร เผื่อบูตครั้งหน้า WiFiManager ต่อด้วย WiFi เดิมได้เลยโดยไม่เปิดพอร์ทัลอีก
  prefs.putString("cabinet_id", cabinetID);
  prefs.putString("server_addr", serverHost + ":" + String(serverPort));

  // ประกอบ MQTT topic ของตู้นี้ไว้ใช้ซ้ำตลอดทั้งไฟล์ (smartlibrary/<cabinet_id>/...)
  TOPIC_CONTROL = "smartlibrary/" + cabinetID + "/control";
  TOPIC_RFID    = "smartlibrary/" + cabinetID + "/rfid";
  TOPIC_FULL    = "smartlibrary/" + cabinetID + "/full";
  TOPIC_STATUS  = "smartlibrary/" + cabinetID + "/status";

  Serial.printf("[OK] WiFi Connected! IP: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("[SETUP] Cabinet ID: %s\n", cabinetID.c_str());
  Serial.printf("[SETUP] Server: %s:%d\n", serverHost.c_str(), serverPort);

  // จำกัดเวลารอตอน connect TCP ไปยัง MQTT broker ไม่ให้เกิน 3 วิ (ของเดิมไม่ได้ตั้งไว้ ใช้ค่า default ของ
  // WiFiClient ซึ่งอาจรอนานหลายวินาทีถ้า broker เข้าไม่ถึง/ไม่ตอบ) เพราะ mqtt.connect() ที่เรียกใน
  // reconnect() ทุก 5 วิ เป็นการบล็อก loop() ทั้งลูป ถ้ารอนานเกินไปจะไปบล็อก wm.process() ที่ต้องเรียก
  // ทุกรอบ loop() ด้วย ทำให้พอร์ทัลพื้นหลัง (startWebPortal) แทบไม่ตอบหน้าเว็บเลยช่วงที่ MQTT ต่อไม่ติด
  // (บั๊กที่เจอ: WiFiClient::setTimeout() ของ ESP32 core รับค่าเป็น "วินาที" ไม่ใช่ "มิลลิวินาที" แบบ
  // Stream::setTimeout() ทั่วไป ของเดิมที่เขียน setTimeout(3000) จึงกลายเป็นตั้งไว้ 3000 วินาที (~50 นาที)
  // ไม่ได้ช่วยลด block เลย ต้องใส่ "3" ไม่ใช่ "3000")
  espClient.setTimeout(3);
  mqtt.setServer(serverHost.c_str(), serverPort);

  // เปิด AP "SmartLibrary-Setup" ควบคู่กับ WiFi หลักไว้ตลอดเวลา (AP+STA) ไม่ใช่แค่ตอนเปิดเครื่องครั้งแรก
  // หรือตอนกดปุ่มขอพอร์ทัลใหม่เท่านั้น — ของเดิม WiFiManager จะปิด AP ทิ้งทันทีที่ต่อ WiFi หลักสำเร็จ ทำให้
  // หา SSID "SmartLibrary-Setup" ในรายการ WiFi ไม่เจอเลยตอนเครื่องทำงานปกติ ต้องกดปุ่มก่อนถึงจะโผล่มา —
  // ตอนนี้เปิดค้างไว้เสมอ ต่อเข้า AP นี้ได้ทันทีไม่ต้องกดปุ่มรอก่อน (ESP32 รองรับ AP+STA พร้อมกันได้)
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP("SmartLibrary-Setup", AP_PASSWORD);
  Serial.printf("[SETUP] เปิด AP \"SmartLibrary-Setup\" ควบคู่ไว้ตลอด (IP: %s)\n", WiFi.softAPIP().toString().c_str());

  // เปิดพอร์ทัลตั้งค่าค้างไว้ที่ IP ปัจจุบันของบอร์ดบนเครือข่ายปกติด้วย (ไม่ใช่แค่ตอนเปิด AP) ต่อเน็ตอยู่
  // แล้วก็เข้าไปแก้รหัสตู้/Server/WiFi ได้ทุกเมื่อผ่าน http://<ip ของบอร์ด>/ หรือต่อเข้า AP ด้านบนแล้วเข้า
  // http://192.168.4.1/ ก็ได้เหมือนกัน — ไม่ต้องกดปุ่ม/รอเปิด AP ใหม่อีกแล้ว
  // (ต้องมี wm.process() เรียกใน loop() ด้วยไม่งั้นพอร์ทัลนี้จะไม่ตอบหน้าเว็บ)
  wm.startWebPortal();
}

void setup() {
  Serial.begin(115200);
  Serial2.begin(57600, SERIAL_8N1, RXD2, TXD2);
  Serial1.begin(9600, SERIAL_8N1, BARCODE_RXD, BARCODE_TXD);

  Serial.printf("MAC Address: %s\n", WiFi.macAddress().c_str());

  // LED
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // กลอนไฟฟ้าล็อกตู้ — ล็อกไว้ก่อนเป็นค่าเริ่มต้นตอนบูตเสมอ (fail-secure) จนกว่าจะมีคนสั่งปลดล็อก
  // จากหน้า Dashboard
  pinMode(LOCK_PIN, OUTPUT);
  setLock(true);

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

  // ===== ตั้งค่า WiFi + รหัสตู้ + Server ผ่าน WiFiManager (แทน secrets.h/static IP เดิมทั้งหมด) =====
  pinMode(FACTORY_RESET_PIN, INPUT_PULLUP);
  prefs.begin("smartlib", false);

  // กดปุ่ม Factory Reset ค้างไว้ตอนเปิดเครื่อง (ขาโดนดึงลง LOW) เพื่อล้างค่า WiFi/รหัสตู้/Server ที่
  // เคยบันทึกไว้ทั้งหมด แล้วเปิดพอร์ทัลตั้งค่าใหม่ — ใช้ตอนจะย้ายบอร์ดนี้ไปเป็นตู้อื่น/เครือข่ายอื่น
  bool bootForcePortal = (digitalRead(FACTORY_RESET_PIN) == LOW);
  if (bootForcePortal) {
    Serial.println("[SETUP] Factory Reset ถูกกด — ล้างค่าเดิมทั้งหมด");
    prefs.clear();
  }

  // ถ้ามีค่าที่บันทึกไว้แล้ว (เช่น เคยตั้งค่าตอน dev/เคยเทสมาก่อน) autoConnect() จะต่อ WiFi เดิมไปเลย
  // โดยไม่เปิดพอร์ทัลให้เห็นอีก — ถ้าต้องการบังคับเปิดพอร์ทัลใหม่โดยไม่ต้องรีสตาร์ทบอร์ด ให้กดปุ่มนี้ค้าง
  // ไว้ 3 วินาทีตอนเครื่องทำงานปกติ (เช็คใน loop() ด้านล่าง) ก็เปิดพอร์ทัลได้ทันทีเหมือนกัน
  setupWiFiAndIdentity(bootForcePortal);
  mqtt.setCallback(callback);
  // ลด keepalive จาก default 15 วินาทีเหลือ 5 วินาที — สงสัยว่า NAT ของ hotspot มือถือ timeout
  // connection ที่ "เงียบ" เร็วกว่า 15 วินาที ทำให้หลุดก่อนที่จะได้ส่ง ping รอบถัดไป ลองส่งถี่ขึ้นดูก่อน
  mqtt.setKeepAlive(5);

  Serial.println("--- RFID + Motor + MQTT ready ---");
}

void loop() {
  unsigned long currentTime = millis();

  bootBlinkTick(); // กะพริบไฟต่อเนื่องจนกว่าจะต่อ MQTT server สำเร็จครั้งแรก (ไม่บล็อก)

  // ให้พอร์ทัลพื้นหลัง (startWebPortal ใน setupWiFiAndIdentity) ตอบหน้าเว็บได้ตลอด — ถ้าไม่ได้เปิดอยู่
  // (เช่น ระหว่างที่กำลังบังคับพอร์ทัลแบบ AP ด้านล่างอยู่) ฟังก์ชันนี้จะเช็คแล้วไม่ทำอะไรเลย ไม่เสียเวลา
  wm.process();

  // --- กดปุ่ม Factory Reset ค้าง 3 วินาทีตอนเครื่องทำงานปกติ: เปิดพอร์ทัล "SmartLibrary-Setup" (AP) ได้
  //     ทันทีโดยไม่ต้องรีสตาร์ทบอร์ด พร้อมค่าปัจจุบันเติมไว้ให้แก้ต่อได้เลย (ไม่ล้างค่าเดิมทิ้งแบบปุ่มตอน
  //     บูต เพราะจุดนี้คือ "เข้าไปแก้" ไม่ใช่ "รีเซ็ตเพื่อย้ายตู้") ---
  static unsigned long resetHoldStart = 0;
  if (digitalRead(FACTORY_RESET_PIN) == LOW) {
    if (resetHoldStart == 0) {
      resetHoldStart = currentTime;
    } else if (currentTime - resetHoldStart >= 3000) {
      Serial.println("[SETUP] กดปุ่ม Factory Reset ค้าง 3 วิระหว่างทำงาน — เปิดพอร์ทัลตั้งค่าใหม่ทันที");
      resetHoldStart = 0;
      wm.stopWebPortal();                        // ปิดพอร์ทัลพื้นหลังก่อน กันชนกับพอร์ทัลแบบ AP ด้านล่าง
      wm.startConfigPortal("SmartLibrary-Setup", AP_PASSWORD); // บล็อกจนกว่าจะเซฟ/timeout 180 วิ
      // ถ้ากดเซฟในพอร์ทัลนี้ onParamsSaved() จะ restart เครื่องไปจากข้างในเลย (ไม่มีทางรันถึงบรรทัดถัดไป)
      // ถ้าแค่ timeout เฉยๆไม่ได้เซฟอะไร ให้เปิดพอร์ทัลพื้นหลังกลับมาแล้วทำงานต่อตามปกติ
      wm.startWebPortal();
      return; // ข้ามรอบ loop() นี้ไปเลย
    }
  } else {
    resetHoldStart = 0;
  }

  if (WiFi.status() != WL_CONNECTED) {
    if (currentTime - lastWifiRetryTime > 30000 || lastWifiRetryTime == 0) {
      lastWifiRetryTime = currentTime;
      Serial.printf("[WiFi] Reconnecting... SSID: %s\n", WiFi.SSID().c_str());
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

  // --- 0.7 อ่านเครื่องสแกนบาร์โค้ด (บัตรนักศึกษา/ตัวตน) แบบไม่บล็อก ---
  readBarcodeScanner(currentTime);

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

      mqtt.publish(TOPIC_RFID.c_str(), payload);
      Serial.printf("[RFID] Published: %s\n", payload);
    }
    isCollecting = false;
  }
}
