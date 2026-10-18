// Combined ESP32 kiosk controller: RFID, temperature, height, BLE scale,
// Omron BP monitor, status LEDs, Wi-Fi, and Supabase session updates.
// Configure credentials in an untracked local secrets.h (see secrets.h.example).
#include <Adafruit_MLX90614.h>
#include <HTTPClient.h>
#include <MFRC522.h>
#include <SPI.h>
#include <WiFi.h>
#include <WiFiMulti.h>
#include <Wire.h>
#include <algorithm>
#include <cctype>
#include <cmath>
#include <new>
#include <vector>
#include <NimBLEDevice.h>
#include "secrets.h"

#ifndef SUPABASE_KEY
#error "Set SUPABASE_KEY in local secrets.h"
#endif
#ifndef KIOSK_WIFI_NETWORKS
#error "Set KIOSK_WIFI_NETWORKS in local secrets.h"
#endif

struct APConfig { const char *ssid; const char *pass; };
const APConfig KNOWN_NETWORKS[] = KIOSK_WIFI_NETWORKS;
const int TOTAL_NETWORKS = sizeof(KNOWN_NETWORKS) / sizeof(KNOWN_NETWORKS[0]);
WiFiMulti wifiMulti;

static const char *SUPABASE_URL = "https://nwgjzwfyqtyhexrjetyr.supabase.co/rest/v1/kiosk_sessions";

// 38-pin ESP32 DevKit pin assignment from the supplied firmware.
#define RFID_SS_PIN 15
#define RFID_RST_PIN 4
#define RFID_SCK_PIN 18
#define RFID_MISO_PIN 19
#define RFID_MOSI_PIN 23
#define I2C_SDA_PIN 21
#define I2C_SCL_PIN 22
#define US_TRIG_PIN 13
#define US_ECHO_PIN 14
#define LED_RED_PIN 25
#define LED_GREEN_PIN 26
#define LED_BLUE_PIN 27

const float CEILING_HEIGHT_METERS = 2.1336f;
const float TEMP_CLINICAL_OFFSET = 2.60f;
const float MIN_HUMAN_HEIGHT_M = 0.60f;
const float MAX_HUMAN_HEIGHT_M = 2.20f;
const float SKIN_PRESENCE_THRESHOLD = 30.5f;
static const char *TARGET_SCALE_MAC = "78:66:a5:e0:5e:77";
static const unsigned long SCALE_SIGNAL_TIMEOUT_MS = 6000;
static const char *TARGET_OMRON_MAC = "c9:33:c0:ef:a2:e5";
static const char *TARGET_OMRON_NAME = "BLESmart_0000047EC933C0EFA2E5";
static const unsigned long OMRON_RECONNECT_COOLDOWN_MS = 10000;
static NimBLEUUID OMRON_SERVICE_UUID("0000FE4A-0000-1000-8000-00805F9B34FB");
static NimBLEUUID OMRON_B305_UUID("b305b680-aee7-11e1-a730-0002a5d5c51b");
static NimBLEUUID OMRON_DB5B_UUID("db5b55e0-aee7-11e1-965e-0002a5d5c51b");
static NimBLEUUID OMRON_DATA_UUID("49123040-aee8-11e1-a74d-0002a5d5c51b");

MFRC522 rfid(RFID_SS_PIN, RFID_RST_PIN);
Adafruit_MLX90614 mlx;
NimBLEScan *pBLEScan = nullptr;
NimBLEClient *omronClient = nullptr;
NimBLERemoteCharacteristic *omronB305Char = nullptr;
NimBLERemoteCharacteristic *omronDb5bChar = nullptr;
NimBLERemoteCharacteristic *omronDataChar = nullptr;

volatile float latestScaleWeightKg = -1.0f;
volatile bool latestScaleSettled = false;
volatile unsigned long lastScalePacketMs = 0;
bool scaleWasConnected = false;
bool wasConnected = false;
unsigned long lastWiFiCheck = 0;
unsigned long lastPollTime = 0;
unsigned long lastOmronAttemptMs = 0;
unsigned long lastRfidDiagnosticMs = 0;
unsigned long lastOmronAdvertisementLogMs = 0;
unsigned long lastNoPendingRequestLogMs = 0;
volatile bool omronConnectRequested = false;
NimBLEAdvertisedDevice *omronAdvertisedDevice = nullptr;
volatile bool omronSessionAcknowledged = false;
volatile bool omronBpDataReceived = false;
volatile bool omronReadingNeedsProcessing = false;
volatile bool pendingOmronBP = false;
volatile bool bpUploadTaskRunning = false;
uint32_t lastOmronReadingSignature = 0;
int activeKioskSessionId = -1;
volatile bool activeSessionNeedsBP = false;

struct OmronBPReading {
  int systolic = 0, diastolic = 0, pulse = 0;
  uint8_t rawSystolic = 0, rawDiastolic = 0, rawPulse = 0;
  bool valid = false;
};
OmronBPReading latestOmronBP;

struct OmronBPUploadTaskData {
  int sessionId;
  OmronBPReading reading;
};

std::string toLowerCopy(const std::string &value) {
  std::string result = value;
  std::transform(result.begin(), result.end(), result.begin(),
    [](unsigned char c) { return std::tolower(c); });
  return result;
}

void setLEDColor(bool red, bool green, bool blue) {
  digitalWrite(LED_RED_PIN, red ? HIGH : LOW);
  digitalWrite(LED_GREEN_PIN, green ? HIGH : LOW);
  digitalWrite(LED_BLUE_PIN, blue ? HIGH : LOW);
}

void updateStatusLED() {
  if (WiFi.status() == WL_CONNECTED) setLEDColor(false, true, false);
  else setLEDColor(true, false, false);
}

void addSupabaseHeaders(HTTPClient &http) {
  http.addHeader("Content-Type", "application/json");
  // Publishable API keys are not JWTs; send them only as the apikey.
  http.addHeader("apikey", SUPABASE_KEY);
}

bool updateOmronBPForSession(int sessionId, const OmronBPReading &reading) {
  if (sessionId < 0 || !reading.valid || WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  http.setTimeout(5000);
  http.begin(String(SUPABASE_URL) + "?id=eq." + String(sessionId) + "&status=eq.completed");
  addSupabaseHeaders(http);
  String payload = "{\"systolic_mmhg\":" + String(reading.systolic) +
    ",\"diastolic_mmhg\":" + String(reading.diastolic) +
    ",\"pulse_bpm\":" + String(reading.pulse) + "}";
  int code = http.sendRequest("PATCH", payload);
  String response = http.getString();
  http.end();
  Serial.printf("[Supabase] BP PATCH response: %d %s\n", code, response.c_str());
  if (code >= 200 && code < 300) { pendingOmronBP = false; activeSessionNeedsBP = false; return true; }
  return false;
}

void omronBPUploadTask(void *parameter) {
  OmronBPUploadTaskData *taskData = static_cast<OmronBPUploadTaskData *>(parameter);
  bool saved = updateOmronBPForSession(taskData->sessionId, taskData->reading);
  if (!saved) {
    pendingOmronBP = true;
    Serial.println("[OMRON] BP upload failed in background; RFID polling remains active.");
  } else {
    Serial.println("[OMRON] Background BP upload finished.");
  }
  delete taskData;
  bpUploadTaskRunning = false;
  vTaskDelete(nullptr);
}

uint32_t getOmronReadingSignature() {
  uint32_t value = 2166136261UL;
  value = (value ^ latestOmronBP.rawSystolic) * 16777619UL;
  value = (value ^ latestOmronBP.rawDiastolic) * 16777619UL;
  value = (value ^ latestOmronBP.rawPulse) * 16777619UL;
  return value;
}

void handleOmronBPReading() {
  if (!latestOmronBP.valid || activeKioskSessionId < 0 || !omronReadingNeedsProcessing) return;
  omronReadingNeedsProcessing = false;
  // The cuff may keep advertising the same stored measurement after it
  // finishes. Disarm BP discovery immediately so queued advertisements do
  // not reconnect repeatedly and starve RFID polling if the upload retries.
  activeSessionNeedsBP = false;
  uint32_t signature = getOmronReadingSignature();
  if (signature == lastOmronReadingSignature && signature != 0) {
    Serial.println("[OMRON] Same reading already processed."); return;
  }
  lastOmronReadingSignature = signature;
  if (bpUploadTaskRunning) {
    pendingOmronBP = true;
    Serial.println("[OMRON] Background BP upload already running; RFID polling continues.");
    return;
  }
  OmronBPUploadTaskData *taskData = new (std::nothrow) OmronBPUploadTaskData;
  if (!taskData) {
    pendingOmronBP = true;
    Serial.println("[OMRON] Could not queue BP upload; RFID polling continues.");
    return;
  }
  taskData->sessionId = activeKioskSessionId;
  taskData->reading = latestOmronBP;
  bpUploadTaskRunning = true;
  BaseType_t taskCreated = xTaskCreate(omronBPUploadTask, "omronBPUpload", 8192, taskData, 1, nullptr);
  if (taskCreated != pdPASS) {
    bpUploadTaskRunning = false;
    delete taskData;
    pendingOmronBP = true;
    Serial.println("[OMRON] Could not start BP upload task; RFID polling continues.");
  } else {
    Serial.println("[OMRON] BP upload queued in background; RFID polling continues.");
  }
}

void omronNotifyCallback(NimBLERemoteCharacteristic *characteristic, uint8_t *data, size_t length, bool) {
  if (!length) return;
  if (characteristic->getUUID() == OMRON_B305_UUID) {
    if (length >= 6 && data[0] == 0x91 && data[1] == 0x00 && data[2] == 0x71 &&
        data[3] == 0x00 && data[4] == 0xF3 && data[5] == 0x6A) omronSessionAcknowledged = true;
    return;
  }
  if (characteristic->getUUID() != OMRON_DATA_UUID || length < 9 ||
      data[0] != 0x16 || data[1] != 0x81 || data[2] != 0x00 ||
      data[3] != 0x03 || data[4] != 0x9E || data[5] != 0x0E) return;
  int systolic = data[6] + 25, diastolic = data[7], pulse = data[8];
  if (systolic < 40 || systolic > 250 || diastolic < 20 || diastolic > 150 || pulse < 20 || pulse > 220) return;
  latestOmronBP.systolic = systolic;
  latestOmronBP.diastolic = diastolic;
  latestOmronBP.pulse = pulse;
  latestOmronBP.rawSystolic = data[6];
  latestOmronBP.rawDiastolic = data[7];
  latestOmronBP.rawPulse = data[8];
  latestOmronBP.valid = true;
  omronBpDataReceived = true;
  // Prevent another scan callback from starting a second Omron connection
  // while the main loop saves this measurement and restores RFID polling.
  omronReadingNeedsProcessing = true;
  activeSessionNeedsBP = false;
  Serial.printf("[OMRON] BP %d/%d mmHg, pulse %d BPM\n", systolic, diastolic, pulse);
  // Send the live result through device-bridge to the kiosk immediately;
  // the separate Supabase PATCH continues to persist the same reading.
  Serial.printf("{\"type\":\"blood_pressure_reading\",\"systolic\":%d,\"diastolic\":%d,\"pulseBpm\":%d,\"bloodPressure\":\"%d/%d\"}\n",
                systolic, diastolic, pulse, systolic, diastolic);
}

bool omronWriteCommand(NimBLERemoteCharacteristic *characteristic, const uint8_t *data, size_t length) {
  if (!characteristic) return false;
  if (characteristic->canWriteNoResponse()) return characteristic->writeValue(data, length, false);
  if (characteristic->canWrite()) return characteristic->writeValue(data, length, true);
  return false;
}

bool runOmronSync() {
  if (!omronB305Char || !omronDb5bChar || !omronDataChar) return false;
  latestOmronBP.valid = false;
  omronSessionAcknowledged = false;
  omronBpDataReceived = false;
  omronReadingNeedsProcessing = false;
  const uint8_t init[20] = {0x11,0x71,0x00,0xF3,0x6A};
  if (!omronWriteCommand(omronB305Char, init, sizeof(init))) return false;
  unsigned long start = millis();
  while (!omronSessionAcknowledged && millis() - start < 3000) delay(10);
  if (!omronSessionAcknowledged) return false;
  delay(300);
  const uint8_t commands[][8] = {
    {0x08,0x00,0x00,0x00,0x00,0x10,0x00,0x18},
    {0x08,0x01,0x00,0x02,0x60,0x2C,0x00,0x47},
    {0x08,0x01,0x00,0x02,0x8C,0x18,0x00,0x9F},
    {0x08,0x01,0x00,0x03,0x9E,0x0E,0x00,0x9A}
  };
  for (const auto &command : commands) {
    if (!omronWriteCommand(omronDb5bChar, command, sizeof(command))) return false;
    delay(250);
  }
  start = millis();
  // Allow the cuff enough time to complete inflation and report a reading.
  while (!omronBpDataReceived && millis() - start < 120000UL) delay(20);
  Serial.printf("[OMRON] Measurement wait ended; received=%s\n", omronBpDataReceived ? "yes" : "no");
  return omronBpDataReceived && latestOmronBP.valid;
}

bool connectToOmron(NimBLEAdvertisedDevice *device) {
  if (!device) return false;
  lastOmronAttemptMs = millis();
  if (!omronClient) { omronClient = NimBLEDevice::createClient(); omronClient->setConnectTimeout(20); }
  if (!omronClient->connect(device)) return false;
  delay(1500);
  NimBLERemoteService *service = omronClient->getService(OMRON_SERVICE_UUID);
  if (!service) { omronClient->disconnect(); return false; }
  omronB305Char = service->getCharacteristic(OMRON_B305_UUID);
  omronDb5bChar = service->getCharacteristic(OMRON_DB5B_UUID);
  omronDataChar = service->getCharacteristic(OMRON_DATA_UUID);
  if (!omronB305Char || !omronDb5bChar || !omronDataChar ||
      !omronB305Char->subscribe(true, omronNotifyCallback) ||
      !omronDataChar->subscribe(true, omronNotifyCallback)) {
    omronClient->disconnect(); return false;
  }
  bool synced = runOmronSync();
  Serial.printf("[OMRON] Sync returned: %s\n", synced ? "success" : "failure");
  return synced;
}

class ScaleScanCallbacks : public NimBLEScanCallbacks {
  void onResult(const NimBLEAdvertisedDevice *device) override {
    std::string address = toLowerCopy(device->getAddress().toString());
    std::string name = device->haveName() ? device->getName() : "";
    if (address == TARGET_OMRON_MAC || name == TARGET_OMRON_NAME) {
      if (millis() - lastOmronAdvertisementLogMs >= 5000) {
        lastOmronAdvertisementLogMs = millis();
        Serial.printf("[BLE] Omron advertisement seen; BP request=%s, session=%d\n",
                      activeSessionNeedsBP ? "yes" : "no", activeKioskSessionId);
      }
      if (activeSessionNeedsBP && activeKioskSessionId >= 0 && !omronConnectRequested && (!omronClient || !omronClient->isConnected()) &&
          millis() - lastOmronAttemptMs >= OMRON_RECONNECT_COOLDOWN_MS) {
        NimBLEDevice::getScan()->stop();
        if (omronAdvertisedDevice) delete omronAdvertisedDevice;
        omronAdvertisedDevice = new NimBLEAdvertisedDevice(*device);
        omronConnectRequested = true;
      }
      return;
    }
    if (address != TARGET_SCALE_MAC || !device->haveManufacturerData()) return;
    std::string data = device->getManufacturerData();
    if (data.size() < 4) return;
    const auto *bytes = reinterpret_cast<const uint8_t *>(data.data());
    float kg = ((static_cast<uint16_t>(bytes[2]) << 8) | bytes[3]) / 100.0f;
    bool settled = data.size() >= 9 && bytes[8] == 0x25;
    if (kg >= 1.0f && kg <= 220.0f) {
      latestScaleWeightKg = kg; latestScaleSettled = settled; lastScalePacketMs = millis();
      Serial.printf("[Scale] %.2f kg %s\n", kg, settled ? "SETTLED" : "MEASURING");
    }
  }
};
ScaleScanCallbacks scaleScanCallbacks;

void setupBLE() {
  NimBLEDevice::init("");
  pBLEScan = NimBLEDevice::getScan();
  pBLEScan->setScanCallbacks(&scaleScanCallbacks, false);
  pBLEScan->setDuplicateFilter(false);
  pBLEScan->setActiveScan(false);
  pBLEScan->setInterval(80);
  pBLEScan->setWindow(80);
  pBLEScan->setMaxResults(0);
  pBLEScan->start(0, false, true);
}

void processOmronConnectionRequest() {
  if (!omronConnectRequested || !omronAdvertisedDevice) return;
  NimBLEAdvertisedDevice *device = omronAdvertisedDevice;
  omronAdvertisedDevice = nullptr;
  omronConnectRequested = false;
  bool ok = connectToOmron(device);
  delete device;
  Serial.printf("[OMRON] Connection flow returned: %s\n", ok ? "success" : "failure");
  // Keep BLE teardown and RFID recovery ahead of the HTTPS upload.
  if (omronClient && omronClient->isConnected()) omronClient->disconnect();
  Serial.println("[OMRON] BLE disconnect finished.");
  omronB305Char = nullptr; omronDb5bChar = nullptr; omronDataChar = nullptr;
  delay(250);
  // Reset the RC522 after the long BLE measurement so it is ready for
  // the next card even if its field/crypto state was left active.
  // Restart the SPI peripheral and pulse the reader's hardware reset.
  // PCD_Init() alone may not recover a reader/bus left unresponsive.
  digitalWrite(RFID_SS_PIN, HIGH);
  SPI.end();
  delay(20);
  SPI.begin(RFID_SCK_PIN, RFID_MISO_PIN, RFID_MOSI_PIN, RFID_SS_PIN);
  digitalWrite(RFID_RST_PIN, LOW);
  delay(20);
  digitalWrite(RFID_RST_PIN, HIGH);
  delay(50);
  rfid.PCD_Init();
  delay(50);
  rfid.PCD_AntennaOn();
  rfid.PCD_SetAntennaGain(rfid.RxGain_max);
  byte rfidVersion = rfid.PCD_ReadRegister(rfid.VersionReg);
  Serial.printf("[RFID] Reader reset after BP; RC522 version=0x%02X%s\n",
                rfidVersion,
                (rfidVersion == 0x00 || rfidVersion == 0xFF) ? " (no reader response)" : "");
  // Omron connection stops the shared BLE scan. Start it again now.
  if (pBLEScan && !pBLEScan->isScanning()) pBLEScan->start(0, false, true);
  Serial.println("[OMRON] Recovery finished; RFID polling resumes.");
}

float getRawDistanceMeters() {
  digitalWrite(US_TRIG_PIN, LOW); delayMicroseconds(2);
  digitalWrite(US_TRIG_PIN, HIGH); delayMicroseconds(10); digitalWrite(US_TRIG_PIN, LOW);
  long duration = pulseIn(US_ECHO_PIN, HIGH, 30000);
  return duration == 0 ? -1.0f : duration * 0.000343f / 2.0f;
}

float computeFilteredAverage(std::vector<float> &samples, float maxDeviation) {
  if (samples.empty()) return 0.0f;
  if (samples.size() == 1) return samples[0];
  std::vector<float> sorted = samples;
  std::sort(sorted.begin(), sorted.end());
  float median = sorted[sorted.size() / 2], sum = 0;
  int count = 0;
  for (float value : samples) if (std::abs(value - median) <= maxDeviation) { sum += value; count++; }
  return count ? sum / count : median;
}

float measureWeightFromScale(unsigned long maxWaitMs) {
  unsigned long start = millis();
  unsigned long packetAtStart = lastScalePacketMs;
  while (millis() - start < maxWaitMs) {
    unsigned long packetAtRead = lastScalePacketMs;
    if (packetAtRead != packetAtStart && packetAtRead && millis() - packetAtRead < 4000) {
      packetAtStart = packetAtRead;
      if (latestScaleSettled && latestScaleWeightKg > 1.0f) return latestScaleWeightKg;
    }
    delay(100);
  }
  return -1.0f;
}

float measureTemperature() {
  unsigned long start = millis();
  while (millis() - start < 5000 && mlx.readObjectTempC() < SKIN_PRESENCE_THRESHOLD) delay(50);
  std::vector<float> samples;
  start = millis();
  while (millis() - start < 3000) {
    float value = mlx.readObjectTempC();
    if (value >= 28.0f && value <= 43.0f) samples.push_back(value + TEMP_CLINICAL_OFFSET);
    delay(100);
  }
  return computeFilteredAverage(samples, 0.6f);
}

float measureHeight() {
  std::vector<float> samples;
  unsigned long start = millis();
  while (millis() - start < 2000) {
    float distance = getRawDistanceMeters();
    if (distance > 0) {
      float height = CEILING_HEIGHT_METERS - distance;
      if (height >= MIN_HUMAN_HEIGHT_M && height <= MAX_HUMAN_HEIGHT_M) samples.push_back(height);
    }
    delay(80);
  }
  return computeFilteredAverage(samples, 0.10f);
}

bool sendRfidTapToSupabase(const String &uid) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  http.setTimeout(5000);
  http.begin(SUPABASE_URL); addSupabaseHeaders(http); http.addHeader("Prefer", "return=representation");
  int code = http.POST(String("{\"rfid_uid\":\"") + uid + "\",\"status\":\"tap_logged\"}");
  String response = http.getString(); http.end();
  Serial.printf("[Supabase] RFID POST: %d %s\n", code, response.c_str());
  if (code < 200 || code >= 300) return false;
  int at = response.indexOf("\"id\"");
  activeSessionNeedsBP = false;
  pendingOmronBP = false;
  if (at >= 0) {
    int colon = response.indexOf(':', at), end = response.indexOf(',', colon);
    if (end < 0) end = response.indexOf('}', colon);
    if (colon >= 0 && end > colon) activeKioskSessionId = response.substring(colon + 1, end).toInt();
  }
  if (activeKioskSessionId >= 0 && pendingOmronBP) updateOmronBPForSession(activeKioskSessionId, latestOmronBP);
  return true;
}

void updateSupabaseVitals(int id, const String &sensorRequired) {
  if (WiFi.status() != WL_CONNECTED) return;
  float temp = 0, height = 0, weight = -1;
  if (sensorRequired == "complete" || sensorRequired == "temperature") temp = measureTemperature();
  if (sensorRequired == "complete" || sensorRequired == "physical") {
    height = measureHeight(); weight = measureWeightFromScale(10000);
  }
  String payload = "{\"status\":\"completed\",\"temp_c\":";
  if ((sensorRequired == "complete" || sensorRequired == "temperature") && temp > 0) payload += String(temp, 2);
  else payload += "null";
  if (sensorRequired == "complete" || sensorRequired == "physical") {
    payload += ",\"height_m\":";
    payload += height > 0 ? String(height, 2) : "null";
    payload += ",\"weight_kg\":";
    payload += weight > 0 ? String(weight, 2) : "null";
  } else payload += ",\"height_m\":null,\"weight_kg\":null";
  payload += "}";
  HTTPClient http; http.setTimeout(5000); http.begin(String(SUPABASE_URL) + "?id=eq." + String(id) + "&status=eq.pending_sensor"); addSupabaseHeaders(http);
  int code = http.sendRequest("PATCH", payload); http.end();
  Serial.printf("[Supabase] Vitals PATCH: %d\n", code); updateStatusLED();
}

void pollSupabaseForSensorRequests() {
  if (WiFi.status() != WL_CONNECTED || millis() - lastPollTime < 2000) return;
  lastPollTime = millis();
  HTTPClient http; http.setTimeout(5000); http.begin(String(SUPABASE_URL) + "?status=eq.pending_sensor&order=id.desc&limit=1");
  http.addHeader("apikey", SUPABASE_KEY);
  int code = http.GET();
  if (code == 200) {
    String body = http.getString();
    int idAt = body.indexOf("\"id\":"), sensorAt = body.indexOf("\"sensor_required\":\"");
    if (idAt >= 0 && sensorAt >= 0) {
      int idEnd = body.indexOf(',', idAt);
      int start = sensorAt + 19, end = body.indexOf('"', start);
      if (idEnd > idAt && end > start) {
        int requestedSessionId = body.substring(idAt + 5, idEnd).toInt();
        String sensorRequired = body.substring(start, end);
        Serial.printf("[Supabase] Pending sensor request: id=%d, sensor_required=%s\n",
                      requestedSessionId, sensorRequired.c_str());
        activeKioskSessionId = requestedSessionId;
        activeSessionNeedsBP = sensorRequired == "complete" || sensorRequired == "bloodPressure";
        lastOmronReadingSignature = 0;
        updateSupabaseVitals(requestedSessionId, sensorRequired);
      }
    } else if (millis() - lastNoPendingRequestLogMs >= 10000) {
      lastNoPendingRequestLogMs = millis();
      Serial.println("[Supabase] No pending sensor request found.");
    }
  } else {
    Serial.printf("[Supabase] Sensor request poll failed: HTTP %d\n", code);
  }
  http.end();
}

void setupWiFiMulti() {
  WiFi.mode(WIFI_STA);
  for (int i = 0; i < TOTAL_NETWORKS; ++i) wifiMulti.addAP(KNOWN_NETWORKS[i].ssid, KNOWN_NETWORKS[i].pass);
  wasConnected = wifiMulti.run() == WL_CONNECTED;
  updateStatusLED();
}

void maintainWiFiConnection() {
  if (millis() - lastWiFiCheck < 3000) return;
  lastWiFiCheck = millis();
  if (WiFi.status() != WL_CONNECTED) wifiMulti.run();
  wasConnected = WiFi.status() == WL_CONNECTED;
  updateStatusLED();
}

void setup() {
  pinMode(LED_RED_PIN, OUTPUT); pinMode(LED_GREEN_PIN, OUTPUT); pinMode(LED_BLUE_PIN, OUTPUT);
  setLEDColor(false, false, false);
  pinMode(RFID_SS_PIN, OUTPUT); digitalWrite(RFID_SS_PIN, HIGH);
  Serial.begin(115200); delay(1000);
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN); mlx.begin();
  SPI.begin(RFID_SCK_PIN, RFID_MISO_PIN, RFID_MOSI_PIN, RFID_SS_PIN);
  pinMode(RFID_RST_PIN, OUTPUT); digitalWrite(RFID_RST_PIN, LOW); delay(20);
  digitalWrite(RFID_RST_PIN, HIGH); delay(50); rfid.PCD_Init(); rfid.PCD_AntennaOn(); rfid.PCD_SetAntennaGain(rfid.RxGain_max);
  pinMode(US_TRIG_PIN, OUTPUT); pinMode(US_ECHO_PIN, INPUT); digitalWrite(US_TRIG_PIN, LOW);
  setupWiFiMulti(); setupBLE();
  Serial.println("ESP32 KIOSK READY: BLE SCALE + OMRON HEM-7140T1");
}

void loop() {
  maintainWiFiConnection();
  if (omronConnectRequested && omronAdvertisedDevice) processOmronConnectionRequest();
  if (pBLEScan && !pBLEScan->isScanning()) pBLEScan->start(0, false, true);
  if (millis() - lastRfidDiagnosticMs >= 5000) {
    lastRfidDiagnosticMs = millis();
    Serial.printf("[RFID] Poll loop alive; reader version=0x%02X\n",
                  rfid.PCD_ReadRegister(rfid.VersionReg));
  }
  bool scaleActive = lastScalePacketMs && millis() - lastScalePacketMs < SCALE_SIGNAL_TIMEOUT_MS;
  if (scaleActive != scaleWasConnected) Serial.println(scaleActive ? "[Scale] Signal active" : "[Scale] Signal idle");
  scaleWasConnected = scaleActive;

  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    String uid;
    for (byte i = 0; i < rfid.uid.size; ++i) { if (rfid.uid.uidByte[i] < 0x10) uid += "0"; uid += String(rfid.uid.uidByte[i], HEX); }
    uid.toUpperCase(); setLEDColor(false, true, true); sendRfidTapToSupabase(uid);
    Serial.printf("{\"type\":\"rfid_tap\",\"uid\":\"%s\"}\n", uid.c_str());
    rfid.PICC_HaltA(); rfid.PCD_StopCrypto1(); delay(1000); updateStatusLED();
  }
  // Save the BP only after this loop has polled RFID and BLE has been
  // disconnected, so a network stall cannot prevent post-BP card detection.
  if (omronReadingNeedsProcessing) handleOmronBPReading();
  pollSupabaseForSensorRequests();
  delay(50);
}
