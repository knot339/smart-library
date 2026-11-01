#include "esp_camera.h"
#include <WiFi.h>
#include "esp_timer.h"
#include "img_converters.h"
#include "Arduino.h"
#include "fb_gfx.h"
#include "soc/soc.h"             // disable brownout problems
#include "soc/rtc_cntl_reg.h"    // disable brownout problems
#include "esp_http_server.h"
#include "SD_MMC.h"
#include "FS.h"
#include <time.h>
#include <vector>
#include "secrets.h"

// ===== Static IP =====
// กัน IP เปลี่ยนไปมาเวลา DHCP แจกใหม่ — ตัว IP ของบอร์ดนี้ (CAMERA_STATIC_IP) อยู่ใน secrets.h แทน
// เพราะโค้ดไฟล์นี้ใช้ร่วมกันทั้งกล้องหน้าตู้และกล้องในตู้ (คนละบอร์ด แต่ build จากโค้ดเดียวกัน)
// ส่วน Gateway/Subnet/DNS เป็นของเครือข่ายเดียวกันทั้งระบบ เลยเป็นค่าคงที่ใช้ร่วมได้ที่นี่
// *** เปลี่ยนเครือข่าย ต้องแก้ทั้ง GATEWAY_IP/DNS1_IP ที่นี่ และ CAMERA_STATIC_IP ใน secrets.h ของทุกบอร์ด ***
IPAddress GATEWAY_IP(10, 239, 123, 98); // ยืนยันจาก ipconfig จริงบน hotspot "P-Hot" (subnet เปลี่ยนเองตอนเปิด-ปิด hotspot ใหม่)
IPAddress SUBNET_MASK(255, 255, 255, 0);
IPAddress DNS1_IP(10, 239, 123, 98);
IPAddress DNS2_IP(8, 8, 8, 8);

#define PART_BOUNDARY "123456789000000000000987654321"
static const char* _STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char* _STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char* _STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

// จำนวนคนดูสตรีมสดพร้อมกันสูงสุด (เกินนี้จะถูกตอบ 503 ปฏิเสธ)
// ยิ่งมากยิ่งกิน RAM/แบนด์วิดท์ WiFi ต่อเฟรม - ปรับตามความจำเป็นจริง
#define MAX_STREAM_CLIENTS 3

// ---------- Pin mapping: AI-Thinker ESP32-CAM ----------
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

// ---------- SD card loop-recording config ----------
#define RECORD_DIR             "/rec"
#define SEGMENT_SECONDS        300     // ตัดไฟล์ใหม่ทุก 5 นาที
#define RECORD_INTERVAL_MS     200     // ~5 fps ตอนบันทึก (คนละอัตราจากสตรีมสด)
#define MIN_FREE_SPACE_MB      300     // เนื้อที่ว่างขั้นต่ำ ถ้าต่ำกว่านี้จะลบไฟล์เก่าสุดทิ้ง (loop recording)
#define FILENAME_LEN           40

const char* ntpServer = "pool.ntp.org";
const long  gmtOffsetSec = 7 * 3600;   // Thailand UTC+7
const int   daylightOffsetSec = 0;

httpd_handle_t recordings_httpd = NULL;
httpd_handle_t file_httpd = NULL;
bool sdReady = false;

// ป้องกัน recordTask (เขียน SD) กับ HTTP handler (อ่าน SD) แย่งการ์ดกันพร้อมกัน
// การ์ด SD ราคาถูก/ความจุสูงมักค้างทั้งระบบถ้าถูกอ่าน-เขียนพร้อมกันหนัก ๆ
SemaphoreHandle_t sdMutex = NULL;

// ================= AVI (Motion-JPEG) writer =================
// เขียนไฟล์ .avi แบบ MJPEG ทีละเฟรม แล้วย้อนกลับไปแก้ header/เขียน idx1 ตอนปิดไฟล์
// offset ใน idx1 นับสัมพัทธ์กับตำแหน่งเริ่มต้นของข้อมูลใน list "movi" (หลัง fourcc "movi")

#pragma pack(push, 1)
struct AviMainHeader {
  char     fcc[4];
  uint32_t cb;
  uint32_t microSecPerFrame;
  uint32_t maxBytesPerSec;
  uint32_t paddingGranularity;
  uint32_t flags;
  uint32_t totalFrames;
  uint32_t initialFrames;
  uint32_t streams;
  uint32_t suggestedBufferSize;
  uint32_t width;
  uint32_t height;
  uint32_t reserved[4];
};

struct AviStreamHeader {
  char     fcc[4];
  uint32_t cb;
  char     fccType[4];
  char     fccHandler[4];
  uint32_t flags;
  uint16_t priority;
  uint16_t language;
  uint32_t initialFrames;
  uint32_t scale;
  uint32_t rate;
  uint32_t start;
  uint32_t length;
  uint32_t suggestedBufferSize;
  uint32_t quality;
  uint32_t sampleSize;
  int16_t  frameLeft, frameTop, frameRight, frameBottom;
};

struct AviStreamFormat {
  char     fcc[4];
  uint32_t cb;
  uint32_t biSize;
  int32_t  biWidth;
  int32_t  biHeight;
  uint16_t biPlanes;
  uint16_t biBitCount;
  uint32_t biCompression;
  uint32_t biSizeImage;
  int32_t  biXPelsPerMeter;
  int32_t  biYPelsPerMeter;
  uint32_t biClrUsed;
  uint32_t biClrImportant;
};
#pragma pack(pop)

struct AviIndexEntry {
  uint32_t offset;
  uint32_t size;
};

struct AviRecorder {
  File file;
  std::vector<AviIndexEntry> index;
  uint32_t moviListDataStart = 0;
  uint32_t offMoviSize = 0;
  uint32_t offAvihTotalFrames = 0;
  uint32_t offAvihMaxBytesPerSec = 0;
  uint32_t offStrhLength = 0;
  uint32_t frameCount = 0;
  uint32_t startMillis = 0;
  uint16_t width = 0, height = 0;
  char path[FILENAME_LEN] = {0};
  bool active = false;
};

AviRecorder recorder;

static void writeU32(File &f, uint32_t v) { f.write((const uint8_t*)&v, 4); }
static void writeFourCC(File &f, const char* s) { f.write((const uint8_t*)s, 4); }

bool aviBegin(AviRecorder &rec, uint16_t width, uint16_t height) {
  time_t now = time(nullptr);
  struct tm tmNow;
  localtime_r(&now, &tmNow);
  snprintf(rec.path, FILENAME_LEN, "%s/%04d%02d%02d_%02d%02d%02d.avi", RECORD_DIR,
    tmNow.tm_year + 1900, tmNow.tm_mon + 1, tmNow.tm_mday,
    tmNow.tm_hour, tmNow.tm_min, tmNow.tm_sec);

  rec.file = SD_MMC.open(rec.path, FILE_WRITE);
  if (!rec.file) return false;

  rec.width = width;
  rec.height = height;
  rec.frameCount = 0;
  rec.index.clear();
  rec.startMillis = millis();

  writeFourCC(rec.file, "RIFF");
  writeU32(rec.file, 0);              // patched on finalize
  writeFourCC(rec.file, "AVI ");

  writeFourCC(rec.file, "LIST");
  writeU32(rec.file, 4 + 64 + 8 + (4 + 64 + 48));  // "hdrl" + avih chunk + strl's own LIST header + strl content
  writeFourCC(rec.file, "hdrl");

  uint32_t avihPos = rec.file.position();
  AviMainHeader avih = {};
  memcpy(avih.fcc, "avih", 4);
  avih.cb = 56;
  avih.microSecPerFrame = RECORD_INTERVAL_MS * 1000UL;
  avih.flags = 0x10;                  // AVIF_HASINDEX
  avih.streams = 1;
  avih.width = width;
  avih.height = height;
  rec.file.write((const uint8_t*)&avih, sizeof(avih));
  rec.offAvihTotalFrames = avihPos + offsetof(AviMainHeader, totalFrames);
  rec.offAvihMaxBytesPerSec = avihPos + offsetof(AviMainHeader, maxBytesPerSec);

  writeFourCC(rec.file, "LIST");
  writeU32(rec.file, 4 + 64 + 48);     // strl content size
  writeFourCC(rec.file, "strl");

  uint32_t strhPos = rec.file.position();
  AviStreamHeader strh = {};
  memcpy(strh.fcc, "strh", 4);
  strh.cb = 56;
  memcpy(strh.fccType, "vids", 4);
  memcpy(strh.fccHandler, "MJPG", 4);
  strh.scale = RECORD_INTERVAL_MS;
  strh.rate = 1000;                   // rate/scale = fps
  strh.frameRight = width;
  strh.frameBottom = height;
  rec.file.write((const uint8_t*)&strh, sizeof(strh));
  rec.offStrhLength = strhPos + offsetof(AviStreamHeader, length);

  AviStreamFormat strf = {};
  memcpy(strf.fcc, "strf", 4);
  strf.cb = 40;
  strf.biSize = 40;
  strf.biWidth = width;
  strf.biHeight = height;
  strf.biPlanes = 1;
  strf.biBitCount = 24;
  strf.biCompression = 0x47504A4D;    // 'MJPG'
  strf.biSizeImage = (uint32_t)width * height * 3;
  rec.file.write((const uint8_t*)&strf, sizeof(strf));

  writeFourCC(rec.file, "LIST");
  rec.offMoviSize = rec.file.position();
  writeU32(rec.file, 0);              // patched on finalize
  writeFourCC(rec.file, "movi");
  rec.moviListDataStart = rec.file.position();

  rec.active = true;
  return true;
}

bool aviAppendFrame(AviRecorder &rec, const uint8_t* data, size_t len) {
  if (!rec.active) return false;
  uint32_t offset = rec.file.position() - rec.moviListDataStart;
  writeFourCC(rec.file, "00dc");
  writeU32(rec.file, len);
  rec.file.write(data, len);
  if (len & 1) {
    uint8_t pad = 0;
    rec.file.write(&pad, 1);          // AVI chunks ต้องเป็นเลขคู่ไบต์
  }
  rec.index.push_back({offset, (uint32_t)len});
  rec.frameCount++;
  return true;
}

void aviFinalize(AviRecorder &rec) {
  if (!rec.active) return;

  writeFourCC(rec.file, "idx1");
  writeU32(rec.file, rec.index.size() * 16);
  for (auto &e : rec.index) {
    writeFourCC(rec.file, "00dc");
    writeU32(rec.file, 0x10);         // AVIIF_KEYFRAME
    writeU32(rec.file, e.offset);
    writeU32(rec.file, e.size);
  }

  uint32_t fileEnd = rec.file.position();
  uint32_t moviListSize = 4 + (fileEnd - (rec.index.size() * 16 + 8) - rec.moviListDataStart);

  rec.file.seek(rec.offMoviSize);
  writeU32(rec.file, moviListSize);

  rec.file.seek(rec.offAvihTotalFrames);
  writeU32(rec.file, rec.frameCount);

  uint32_t elapsedSec = (millis() - rec.startMillis) / 1000;
  if (elapsedSec > 0) {
    rec.file.seek(rec.offAvihMaxBytesPerSec);
    writeU32(rec.file, (fileEnd - 8) / elapsedSec);
  }

  rec.file.seek(rec.offStrhLength);
  writeU32(rec.file, rec.frameCount);

  rec.file.seek(4);
  writeU32(rec.file, fileEnd - 8);

  rec.file.close();
  rec.active = false;
  Serial.printf("Recording saved: %s (%u frames)\n", rec.path, (unsigned)rec.frameCount);
}

// ================= SD loop-recording housekeeping =================

// ลบไฟล์ .avi ค้างขนาด 0 ไบต์ทิ้ง (ซากจากบอร์ด crash/reboot กลางคันขณะเขียนไฟล์ - FAT จะ
// โชว์ขนาด 0 ค้างไว้ตลอดถ้าไฟล์ไม่เคยถูก close() สำเร็จ)
// เรียกตอนบูตเท่านั้น เพราะยังไม่มี recordTask เขียนไฟล์อยู่ จึงปลอดภัยที่จะลบ
void cleanupZeroByteRecordings() {
  std::vector<String> toDelete;
  File dir = SD_MMC.open(RECORD_DIR);
  if (!dir) return;
  File f = dir.openNextFile();
  while (f) {
    if (!f.isDirectory() && f.size() == 0) {
      String name = f.name();
      String full = name.startsWith("/") ? name : String(RECORD_DIR) + "/" + name;
      toDelete.push_back(full);
    }
    f = dir.openNextFile();
  }
  dir.close();

  for (auto &path : toDelete) {
    SD_MMC.remove(path);
    Serial.printf("Removed leftover 0-byte recording: %s\n", path.c_str());
  }
}

String findOldestRecording() {
  File dir = SD_MMC.open(RECORD_DIR);
  if (!dir) return "";
  String oldest = "";
  File f = dir.openNextFile();
  while (f) {
    if (!f.isDirectory()) {
      String name = f.name();
      String full = name.startsWith("/") ? name : String(RECORD_DIR) + "/" + name;
      if (oldest.length() == 0 || full < oldest) oldest = full;
    }
    f = dir.openNextFile();
  }
  dir.close();
  if (recorder.active && oldest == String(recorder.path)) return ""; // อย่าลบไฟล์ที่กำลังเขียนอยู่
  return oldest;
}

void ensureFreeSpace() {
  uint64_t total = SD_MMC.totalBytes();
  uint64_t used = SD_MMC.usedBytes();
  uint64_t freeBytes = total > used ? total - used : 0;
  const uint64_t minFree = (uint64_t)MIN_FREE_SPACE_MB * 1024ULL * 1024ULL;

  while (freeBytes < minFree) {
    String oldest = findOldestRecording();
    if (oldest.length() == 0) break;
    File f = SD_MMC.open(oldest);
    uint64_t fsize = f ? f.size() : 0;
    if (f) f.close();
    if (!SD_MMC.remove(oldest)) break;
    freeBytes += fsize;
    Serial.printf("Deleted old recording to free space: %s\n", oldest.c_str());
  }
}

// ================= Shared latest-frame cache =================
// captureTask เป็นตัวเดียวที่เรียก esp_camera_fb_get() แล้วแคชเฟรม JPEG ล่าสุดไว้ที่นี่
// เหตุผล: ถ้าปล่อยให้ recordTask และ stream client หลายตัวเรียก esp_camera_fb_get()
// ตรง ๆ พร้อมกัน แต่ละ task จะแย่งคิวกล้องกัน ได้รับเฟรมสลับกันไปคนละใบ ทำให้เฟรมเรต
// ของทุกฝ่ายลดลงและจังหวะไม่แน่นอน จึงให้ recordTask และ stream client ทุกตัวอ่านจาก
// cache นี้แทน โดยเทียบ version เพื่อรู้ว่ามีเฟรมใหม่เข้ามาหรือยัง
struct SharedFrame {
  SemaphoreHandle_t mutex = NULL;
  uint8_t *buf = nullptr;
  size_t len = 0;
  size_t capacity = 0;
  uint32_t version = 0;
  uint16_t width = 0, height = 0;
};
SharedFrame gFrame;

volatile int gStreamClientCount = 0;
SemaphoreHandle_t gStreamCountMutex = NULL;

TaskHandle_t captureTaskHandle = NULL;

void captureTask(void *pvParameters) {
  for (;;) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
      vTaskDelay(pdMS_TO_TICKS(10));
      continue;
    }

    uint8_t *jbuf = fb->buf;
    size_t jlen = fb->len;
    bool needFree = false;
    if (fb->format != PIXFORMAT_JPEG) {
      uint8_t *tmp = NULL;
      size_t tlen = 0;
      if (frame2jpg(fb, 80, &tmp, &tlen)) {
        jbuf = tmp;
        jlen = tlen;
        needFree = true;
      } else {
        esp_camera_fb_return(fb);
        continue;
      }
    }

    xSemaphoreTake(gFrame.mutex, portMAX_DELAY);
    if (gFrame.capacity < jlen) {
      uint8_t *nb = (uint8_t *)realloc(gFrame.buf, jlen);
      if (nb) {
        gFrame.buf = nb;
        gFrame.capacity = jlen;
      }
    }
    if (gFrame.buf && gFrame.capacity >= jlen) {
      memcpy(gFrame.buf, jbuf, jlen);
      gFrame.len = jlen;
      gFrame.width = fb->width;
      gFrame.height = fb->height;
      gFrame.version++;
    }
    xSemaphoreGive(gFrame.mutex);

    if (needFree) free(jbuf);
    esp_camera_fb_return(fb);
  }
}

// คัดลอกเฟรมล่าสุดออกจาก cache ใส่ buffer ปลายทาง (โต growable ตามต้องการ) ถ้ามีเฟรมใหม่กว่า lastVersion
// คืนค่า true เมื่อคัดลอกเฟรมใหม่มาให้ (แล้วอัปเดต lastVersion / outBuf / outCap / outLen ให้เอง)
bool copyLatestFrameIfNewer(uint32_t &lastVersion, uint8_t *&outBuf, size_t &outCap, size_t &outLen) {
  bool gotNew = false;
  xSemaphoreTake(gFrame.mutex, portMAX_DELAY);
  if (gFrame.version != lastVersion && gFrame.buf && gFrame.len > 0) {
    if (outCap < gFrame.len) {
      uint8_t *nb = (uint8_t *)realloc(outBuf, gFrame.len);
      if (nb) {
        outBuf = nb;
        outCap = gFrame.len;
      }
    }
    if (outBuf && outCap >= gFrame.len) {
      memcpy(outBuf, gFrame.buf, gFrame.len);
      outLen = gFrame.len;
      lastVersion = gFrame.version;
      gotNew = true;
    }
  }
  xSemaphoreGive(gFrame.mutex);
  return gotNew;
}

// ================= Recording task =================

TaskHandle_t recordTaskHandle = NULL;

void recordTask(void *pvParameters) {
  const TickType_t period = pdMS_TO_TICKS(RECORD_INTERVAL_MS);
  TickType_t lastWake = xTaskGetTickCount();

  static uint8_t *recBuf = NULL;
  static size_t recBufCap = 0;
  static size_t recBufLen = 0;
  uint32_t lastVersion = 0;

  for (;;) {
    if (!sdReady) {
      vTaskDelay(pdMS_TO_TICKS(1000));
      lastWake = xTaskGetTickCount();
      continue;
    }

    if (!recorder.active) {
      xSemaphoreTake(sdMutex, portMAX_DELAY);
      ensureFreeSpace();
      uint16_t w = 640, h = 480;
      xSemaphoreTake(gFrame.mutex, portMAX_DELAY);
      if (gFrame.width && gFrame.height) {
        w = gFrame.width;
        h = gFrame.height;
      }
      xSemaphoreGive(gFrame.mutex);
      bool started = aviBegin(recorder, w, h);
      xSemaphoreGive(sdMutex);
      if (!started) {
        Serial.println("Failed to start new recording segment");
        vTaskDelay(pdMS_TO_TICKS(2000));
        lastWake = xTaskGetTickCount();
        continue;
      }
    }

    if (copyLatestFrameIfNewer(lastVersion, recBuf, recBufCap, recBufLen)) {
      xSemaphoreTake(sdMutex, portMAX_DELAY);
      aviAppendFrame(recorder, recBuf, recBufLen);
      xSemaphoreGive(sdMutex);
    }

    if (recorder.active && (millis() - recorder.startMillis) >= SEGMENT_SECONDS * 1000UL) {
      xSemaphoreTake(sdMutex, portMAX_DELAY);
      aviFinalize(recorder);
      xSemaphoreGive(sdMutex);
    }

    vTaskDelayUntil(&lastWake, period);
  }
}

// ================= HTTP handlers =================

// ---- /stream (พอร์ต 81) ----
// ทำไมไม่ใช้ esp_http_server เหมือน /recordings และ /recordings/file:
// httpd instance หนึ่งมี worker task ประมวลผล request ได้ทีละตัวเท่านั้น handler ที่ค้าง
// connection ไว้ตลอด (เช่นสตรีม MJPEG ที่ส่งเฟรมไม่มีวันจบ) จะยึด task นั้นไว้ทั้งหมด
// ทำให้เครื่องที่สองต่อ TCP ติดแต่ไม่มี worker ว่างมาให้บริการ - ดูได้ทีละเครื่องเท่านั้น
//
// จึงเลี่ยง httpd แล้วเปิด WiFiServer เอง โดยแตก FreeRTOS task ใหม่ให้ทุก client ที่ต่อ
// เข้ามา (จำกัดไว้ที่ MAX_STREAM_CLIENTS ตัว) แต่ละ task อ่านเฟรมล่าสุดจาก gFrame cache
// ที่ captureTask เติมให้ เป็นอิสระจากกัน จึงดูพร้อมกันได้จริง
WiFiServer streamServer(81, MAX_STREAM_CLIENTS + 1);

void streamClientTask(void *pvParameters) {
  WiFiClient client = *(WiFiClient *)pvParameters;
  delete (WiFiClient *)pvParameters;

  client.print("HTTP/1.1 200 OK\r\n");
  client.print(String("Content-Type: ") + _STREAM_CONTENT_TYPE + "\r\n");
  client.print("Access-Control-Allow-Origin: *\r\n");
  client.print("Connection: close\r\n\r\n");

  uint32_t lastVersion = 0;
  uint8_t *buf = NULL;
  size_t cap = 0, len = 0;
  char partBuf[64];

  while (client.connected()) {
    if (copyLatestFrameIfNewer(lastVersion, buf, cap, len)) {
      size_t hlen = snprintf(partBuf, sizeof(partBuf), _STREAM_PART, (unsigned)len);
      if (client.write((const uint8_t *)partBuf, hlen) != hlen) break;
      if (client.write(buf, len) != len) break;
      size_t blen = strlen(_STREAM_BOUNDARY);
      if (client.write((const uint8_t *)_STREAM_BOUNDARY, blen) != blen) break;
    } else {
      vTaskDelay(pdMS_TO_TICKS(15));
    }
  }

  free(buf);
  client.stop();
  xSemaphoreTake(gStreamCountMutex, portMAX_DELAY);
  gStreamClientCount--;
  xSemaphoreGive(gStreamCountMutex);
  vTaskDelete(NULL);
}

void streamListenerTask(void *pvParameters) {
  streamServer.begin();
  streamServer.setNoDelay(true);

  for (;;) {
    WiFiClient client = streamServer.available();
    if (!client) {
      vTaskDelay(pdMS_TO_TICKS(50));
      continue;
    }

    // อ่านบรรทัดแรกของ request แค่พอเช็คว่าเป็น "GET /stream" แล้วระบาย header ที่เหลือทิ้ง
    // พอร์ตนี้ให้บริการแค่สตรีมอย่างเดียว จึงไม่จำเป็นต้อง parse header ให้ครบ
    char reqLine[16] = {0};
    size_t n = 0;
    unsigned long t0 = millis();
    while (millis() - t0 < 1000 && n < sizeof(reqLine) - 1) {
      if (client.available()) {
        reqLine[n++] = client.read();
      } else if (!client.connected()) {
        break;
      } else {
        delay(1);
      }
    }
    unsigned long t1 = millis();
    while (millis() - t1 < 300) {
      if (client.available()) {
        client.read();
        t1 = millis();
      } else if (!client.connected()) {
        break;
      } else {
        delay(1);
      }
    }

    if (strncmp(reqLine, "GET /stream", 11) != 0) {
      client.print("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      client.stop();
      continue;
    }

    xSemaphoreTake(gStreamCountMutex, portMAX_DELAY);
    bool accept = gStreamClientCount < MAX_STREAM_CLIENTS;
    if (accept) gStreamClientCount++;
    xSemaphoreGive(gStreamCountMutex);

    if (!accept) {
      client.print("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
      client.stop();
      continue;
    }

    WiFiClient *ctx = new WiFiClient(client);
    if (xTaskCreate(streamClientTask, "streamClient", 4096, ctx, 1, NULL) != pdPASS) {
      delete ctx;
      client.stop();
      xSemaphoreTake(gStreamCountMutex, portMAX_DELAY);
      gStreamClientCount--;
      xSemaphoreGive(gStreamCountMutex);
    }
  }
}

void startStreamServer() {
  xTaskCreate(streamListenerTask, "streamListener", 4096, NULL, 1, NULL);
}

// GET /recordings -> { files: [ { name, size, active }, ... ] }
// ชื่อไฟล์เป็น YYYYMMDD_HHMMSS.avi อยู่แล้ว ฝั่งเว็บ parse เวลาเริ่มจากชื่อไฟล์ได้เลย
static esp_err_t recordings_list_handler(httpd_req_t *req) {
  httpd_resp_set_type(req, "application/json");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");

  if (!sdReady) {
    const char* err = "{\"files\":[]}";
    return httpd_resp_send(req, err, strlen(err));
  }

  xSemaphoreTake(sdMutex, portMAX_DELAY);

  // มีคนเปิดดูประวัติ -> ปิด/บันทึก segment ที่กำลังอัดอยู่ให้สมบูรณ์ทันที
  // (เคลียร์ทาง ไม่ให้ recordTask เขียนไฟล์ค้างพร้อมกับตอนที่กำลังจะอ่าน list/ไฟล์)
  if (recorder.active) {
    aviFinalize(recorder);
  }

  File dir = SD_MMC.open(RECORD_DIR);
  String json = "{\"files\":[";
  bool first = true;
  if (dir) {
    File f = dir.openNextFile();
    while (f) {
      if (!f.isDirectory()) {
        String name = f.name();
        int slash = name.lastIndexOf('/');
        String base = slash >= 0 ? name.substring(slash + 1) : name;
        if (!first) json += ",";
        first = false;
        json += "{\"name\":\"" + base + "\",\"size\":" + String((uint32_t)f.size()) + ",\"active\":false}";
      }
      f = dir.openNextFile();
    }
    dir.close();
  }
  json += "]}";

  xSemaphoreGive(sdMutex);
  return httpd_resp_send(req, json.c_str(), json.length());
}

// GET /recordings/file?file=YYYYMMDD_HHMMSS.avi  (รองรับ Range header สำหรับ <video> เล่น/เลื่อนวิดีโอ)
static esp_err_t recordings_file_handler(httpd_req_t *req) {
  char query[128];
  char filename[64];
  if (httpd_req_get_url_query_str(req, query, sizeof(query)) != ESP_OK ||
      httpd_query_key_value(query, "file", filename, sizeof(filename)) != ESP_OK) {
    httpd_resp_send_404(req);
    return ESP_FAIL;
  }

  if (strstr(filename, "..") != NULL || strchr(filename, '/') != NULL) {
    httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "invalid filename");
    return ESP_FAIL;
  }

  char path[96];
  snprintf(path, sizeof(path), "%s/%s", RECORD_DIR, filename);

  // ล็อกการ์ดไว้ตลอดการดาวน์โหลด กัน recordTask เขียนไฟล์แทรกจนการ์ดค้าง
  // (แลกกับ recordTask จะหยุดอัดเฟรมชั่วคราวระหว่างมีคนโหลดไฟล์อยู่)
  xSemaphoreTake(sdMutex, portMAX_DELAY);

  File file = SD_MMC.open(path, FILE_READ);
  if (!file) {
    xSemaphoreGive(sdMutex);
    httpd_resp_send_404(req);
    return ESP_FAIL;
  }

  size_t fileSize = file.size();
  size_t rangeStart = 0, rangeEnd = fileSize > 0 ? fileSize - 1 : 0;
  bool isPartial = false;

  char rangeHeader[64];
  if (httpd_req_get_hdr_value_str(req, "Range", rangeHeader, sizeof(rangeHeader)) == ESP_OK) {
    long s = 0, e = -1;
    if (sscanf(rangeHeader, "bytes=%ld-%ld", &s, &e) >= 1) {
      rangeStart = s;
      if (e >= 0) rangeEnd = e;
      isPartial = true;
    }
  }
  if (rangeEnd >= fileSize) rangeEnd = fileSize > 0 ? fileSize - 1 : 0;
  size_t sendLen = fileSize > 0 ? (rangeEnd - rangeStart + 1) : 0;

  httpd_resp_set_type(req, "video/x-msvideo");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Accept-Ranges", "bytes");

  if (isPartial) {
    httpd_resp_set_status(req, "206 Partial Content");
    char contentRange[64];
    snprintf(contentRange, sizeof(contentRange), "bytes %u-%u/%u",
      (unsigned)rangeStart, (unsigned)rangeEnd, (unsigned)fileSize);
    httpd_resp_set_hdr(req, "Content-Range", contentRange);
  }

  char contentLen[16];
  snprintf(contentLen, sizeof(contentLen), "%u", (unsigned)sendLen);
  httpd_resp_set_hdr(req, "Content-Length", contentLen);

  file.seek(rangeStart);
  uint8_t buf[2048];
  size_t remaining = sendLen;
  esp_err_t res = ESP_OK;
  while (remaining > 0 && res == ESP_OK) {
    size_t toRead = remaining < sizeof(buf) ? remaining : sizeof(buf);
    size_t got = file.read(buf, toRead);
    if (got == 0) break;
    res = httpd_resp_send_chunk(req, (const char*)buf, got);
    remaining -= got;
  }
  file.close();
  xSemaphoreGive(sdMutex);
  if (res == ESP_OK) res = httpd_resp_send_chunk(req, NULL, 0);
  return res;
}

// server แยกสำหรับ /recordings (list อย่างเดียว, พอร์ต 82) กันไม่ให้ถูกบล็อกโดยสตรีมสด
// ที่ค้าง connection ตลอดเวลาบนพอร์ต 81
void startRecordingsServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 82;
  config.ctrl_port = 32769;   // ต้องคนละพอร์ตกับ ctrl_port ของ server อื่น (default 32768)

  httpd_uri_t recordings_list_uri = {
    .uri       = "/recordings",
    .method    = HTTP_GET,
    .handler   = recordings_list_handler,
    .user_ctx  = NULL
  };

  if (httpd_start(&recordings_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(recordings_httpd, &recordings_list_uri);
  }
}

// server แยกอีกตัวเฉพาะ /recordings/file (พอร์ต 83)
// การโหลดไฟล์วิดีโอเป็น request ที่ใช้เวลานาน/ค้างได้ง่าย (ไฟล์ใหญ่ หรือเบราว์เซอร์บางตัว
// พยายาม preview ไฟล์ AVI ที่เล่นไม่ได้แล้วค้าง connection ไว้) ถ้าแชร์ instance กับ
// /recordings จะไปบล็อก list เหมือนที่สตรีมสดเคยบล็อกมาก่อน จึงต้องแยกพอร์ตเด็ดขาด
// สแกนหา WIFI_SSID ซ้ำ ๆ ก่อนเชื่อมต่อ เผื่อ AP ยังไม่ขึ้น/ติดต่อไม่ได้ตอนบูต
// จะวนสแกน + ลองเชื่อมต่อไปเรื่อย ๆ จนกว่าจะสำเร็จ
void connectWiFi() {
  WiFi.mode(WIFI_STA);

  // ตั้ง static IP ก่อน begin() เสมอ กัน DHCP แจก IP ใหม่ไปมา (ต้องตรงกับ subnet ของเครือข่ายที่ใช้จริง)
  // CAMERA_STATIC_IP มาจาก secrets.h ของบอร์ดนี้โดยเฉพาะ (กล้องหน้าตู้/ในตู้ ต้องตั้งคนละค่ากัน)
  if (!WiFi.config(CAMERA_STATIC_IP, GATEWAY_IP, SUBNET_MASK, DNS1_IP, DNS2_IP)) {
    Serial.println("[WiFi] ตั้ง static IP ไม่สำเร็จ");
  }

  int attempt = 0;

  while (WiFi.status() != WL_CONNECTED) {
    attempt++;
    Serial.printf("Scanning for WiFi \"%s\" (attempt %d)...\n", WIFI_SSID, attempt);

    int n = WiFi.scanNetworks();
    bool found = false;
    for (int i = 0; i < n; i++) {
      if (WiFi.SSID(i) == WIFI_SSID) found = true;
    }
    WiFi.scanDelete();

    if (!found) {
      Serial.println("Target SSID not in range, rescanning in 3s...");
      delay(3000);
      continue;
    }

    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
      delay(500);
      Serial.print(".");
    }
    Serial.println();

    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("Connect attempt timed out, rescanning...");
    }
  }

  Serial.println("WiFi connected");
}

void startFileServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 83;
  config.ctrl_port = 32770;
  config.stack_size = 8192;   // default 4096 ไม่พอ recordings_file_handler มีบัฟเฟอร์ในตัวเองอยู่แล้ว 2KB+

  httpd_uri_t recordings_file_uri = {
    .uri       = "/recordings/file",
    .method    = HTTP_GET,
    .handler   = recordings_file_handler,
    .user_ctx  = NULL
  };

  if (httpd_start(&file_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(file_httpd, &recordings_file_uri);
  }
}

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); //disable brownout detector

  Serial.begin(115200);
  Serial.setDebugOutput(false);

  Serial.print("MAC Address: ");
  Serial.println(WiFi.macAddress());

  sdMutex = xSemaphoreCreateMutex();
  gFrame.mutex = xSemaphoreCreateMutex();
  gStreamCountMutex = xSemaphoreCreateMutex();

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if(psramFound()){
    config.frame_size = FRAMESIZE_VGA;
    config.jpeg_quality = 10;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_SVGA;
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }

  // Init Camera
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x", err);
    return;
  }

  // กล้องติดตั้งกลับหัวจริง (หมุน 180 องศา) เลยต้องกลับทั้งแนวตั้งและแนวนอนเพื่อให้ภาพตรง
  // ถ้าติดตั้งใหม่แล้วภาพกลับแค่แนวเดียว ให้คอมเมนต์อีกบรรทัดออก เหลือไว้บรรทัดเดียวพอ
  sensor_t *camSensor = esp_camera_sensor_get();
  if (camSensor != nullptr) {
    camSensor->set_vflip(camSensor, 1);
    camSensor->set_hmirror(camSensor, 1);
  }

  // Init SD card (โหมด 1-bit เพราะ GPIO4/12/13 ชนกับพินกล้องบนบอร์ด AI-Thinker)
  if (!SD_MMC.begin("/sdcard", true)) {
    Serial.println("SD Card Mount Failed - recording disabled");
    sdReady = false;
  } else if (SD_MMC.cardType() == CARD_NONE) {
    Serial.println("No SD card attached - recording disabled");
    sdReady = false;
  } else {
    if (!SD_MMC.exists(RECORD_DIR)) SD_MMC.mkdir(RECORD_DIR);
    cleanupZeroByteRecordings();
    sdReady = true;
    Serial.printf("SD Card size: %lluMB\n", SD_MMC.cardSize() / (1024 * 1024));
  }

  // Wi-Fi connection
  connectWiFi();

  // ต้องได้เวลาปัจจุบันมาก่อนตั้งชื่อไฟล์วิดีโอ (YYYYMMDD_HHMMSS)
  configTime(gmtOffsetSec, daylightOffsetSec, ntpServer);
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 10000)) {
    Serial.println("Failed to obtain NTP time - recording filenames may start from 1970");
  }

  Serial.print("Camera Stream Ready! Go to: http://");
  Serial.print(WiFi.localIP());
  Serial.println(":81/stream");

  // captureTask เป็นตัวเดียวที่เรียก esp_camera_fb_get() ต้องเริ่มก่อนใครเสมอ
  // เพื่อให้ recordTask และ stream client ตัวแรกมีเฟรมใน cache ให้อ่านได้ทันที
  xTaskCreatePinnedToCore(captureTask, "captureTask", 4096, NULL, 2, &captureTaskHandle, 1);

  // เปิด server ทั้ง 3 ตัวแยกพอร์ตกันเด็ดขาด: สตรีมสด (81, WiFiServer), list ประวัติ (82),
  // โหลดไฟล์วิดีโอ (83) - กันไม่ให้ endpoint ที่ค้าง connection นานบล็อก endpoint อื่น
  startStreamServer();
  startRecordingsServer();
  startFileServer();

  if (sdReady) {
    xTaskCreatePinnedToCore(recordTask, "recordTask", 8192, NULL, 1, &recordTaskHandle, 1);
  }
}

void loop() {
  delay(1);
}
