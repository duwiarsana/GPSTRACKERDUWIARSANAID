#include <WiFi.h>
#include <PubSubClient.h>
#include <time.h>

// -------------------- User Config --------------------
#define DEVICE_ID        "ESP32C3SIM01"   // Set unique deviceId (must match backend deviceId)
#define WIFI_SSID        "YOUR_WIFI_SSID"
#define WIFI_PASS        "YOUR_WIFI_PASSWORD"

// MQTT Broker
const char* MQTT_HOST = "broker.hivemq.com"; // or your backend broker/IP
const uint16_t MQTT_PORT = 1883;
const char* MQTT_USER = "";                 // if required
const char* MQTT_PASS = "";                 // if required

// Publish interval (ms)
const unsigned long PUBLISH_EVERY_MS = 5000;

// Starting reference position (edit to your area)
// Denpasar, Bali as default example
double baseLat = -8.65;   
double baseLng = 115.22;  

// Random-walk amplitude (degrees). ~0.00001 deg ~ 1.11 m
// Keep small so points are near each other
const double STEP_MIN = 0.00001;  // ~1.1 m
const double STEP_MAX = 0.00007;  // ~7.8 m

WiFiClient espClient;
PubSubClient mqtt(espClient);

unsigned long lastPub = 0;

// Pseudo random helper
static double rnd01() {
  return (double)esp_random() / (double)UINT32_MAX; // [0,1)
}

static double rndRange(double a, double b) {
  return a + (b - a) * rnd01();
}

void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting WiFi");
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
    if (millis() - t0 > 20000) break; // 20s timeout
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi OK, IP: ");
    Serial.println(WiFi.localIP());
    // NTP time sync (UTC)
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    // wait briefly for time
    struct tm tmNow;
    time_t now = 0;
    for (int i = 0; i < 10; i++) {
      time(&now);
      if (now > 1700000000) break; // roughly after 2023-11-14
      delay(200);
    }
    localtime_r(&now, &tmNow);
  } else {
    Serial.println("WiFi failed, will retry in loop");
  }
}

void ensureMQTT() {
  if (mqtt.connected()) return;
  mqtt.setServer(MQTT_HOST, MQTT_PORT);

  String clientId = String("ESP32C3-") + DEVICE_ID + "-" + String((uint32_t)ESP.getEfuseMac(), HEX);
  Serial.print("Connecting MQTT as "); Serial.println(clientId);

  bool ok;
  if (strlen(MQTT_USER) > 0 || strlen(MQTT_PASS) > 0) {
    ok = mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
  } else {
    ok = mqtt.connect(clientId.c_str());
  }

  if (ok) {
    Serial.println("MQTT connected");
  } else {
    Serial.print("MQTT connect failed, rc=");
    Serial.println(mqtt.state());
  }
}

void publishRandomWalk() {
  // Small step around last position
  double dLat = rndRange(STEP_MIN, STEP_MAX) * (rnd01() > 0.5 ? 1 : -1);
  double dLng = rndRange(STEP_MIN, STEP_MAX) * (rnd01() > 0.5 ? 1 : -1);
  baseLat += dLat;
  baseLng += dLng;

  // Simulated telemetry
  // Speed (km/h) ~0-8 when moving, occasional small spike
  double speed = rndRange(0.0, 8.0) + (rnd01() < 0.1 ? rndRange(2.0, 6.0) : 0.0);
  int satellites = 8 + (int)round(rndRange(-2.0, 3.0));
  if (satellites < 0) satellites = 0;
  double accuracy = rndRange(5.0, 15.0); // meters
  double altitude = rndRange(5.0, 60.0); // meters (simulated)
  int batteryLevel = 100 - (millis() / 60000) % 30; // cycles down every 30 minutes
  if (batteryLevel < 10) batteryLevel = 10;
  bool isCharging = false;

  // Topic & JSON payload expected by backend
  String topic = String("gpstracker/device/") + DEVICE_ID + "/location";
  // Prepare ISO timestamp (if NTP is ready), else leave empty for server-side time
  char isoTs[32];
  isoTs[0] = '\0';
  time_t now;
  time(&now);
  if (now > 1700000000) {
    struct tm tmNow;
    gmtime_r(&now, &tmNow);
    // Format: YYYY-MM-DDTHH:MM:SSZ
    strftime(isoTs, sizeof(isoTs), "%Y-%m-%dT%H:%M:%SZ", &tmNow);
  }

  // Note: use double with 6 decimals for lat/lng
  char payload[256];
  if (isoTs[0]) {
    snprintf(payload, sizeof(payload),
             "{\"latitude\":%.6f,\"longitude\":%.6f,\"speed\":%.2f,\"accuracy\":%.2f,\"altitude\":%.2f,\"battery\":{\"level\":%d,\"isCharging\":%s},\"satellites\":%d,\"timestamp\":\"%s\"}",
             baseLat, baseLng, speed, accuracy, altitude, batteryLevel, (isCharging ? "true" : "false"), satellites, isoTs);
  } else {
    // fallback: backend will assign server time
    snprintf(payload, sizeof(payload),
             "{\"latitude\":%.6f,\"longitude\":%.6f,\"speed\":%.2f,\"accuracy\":%.2f,\"altitude\":%.2f,\"battery\":{\"level\":%d,\"isCharging\":%s},\"satellites\":%d,\"timestamp\":\"\"}",
             baseLat, baseLng, speed, accuracy, altitude, batteryLevel, (isCharging ? "true" : "false"), satellites);
  }

  bool ok = mqtt.publish(topic.c_str(), payload);
  Serial.print("PUB "); Serial.print(topic); Serial.print(" => "); Serial.println(payload);
  if (!ok) {
    Serial.println("Publish failed (will retry next cycle)");
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("ESP32-C3 MQTT GPS Simulator");
  WiFi.persistent(false);
}

void loop() {
  ensureWiFi();
  if (WiFi.status() == WL_CONNECTED) {
    ensureMQTT();
  }
  if (mqtt.connected()) {
    mqtt.loop();
  }

  unsigned long now = millis();
  if (mqtt.connected() && now - lastPub >= PUBLISH_EVERY_MS) {
    lastPub = now;
    publishRandomWalk();
  }

  delay(10);
}
