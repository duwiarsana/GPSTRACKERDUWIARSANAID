/*
  GPS Tracker Firmware (Arduino UNO + Quectel L80 + SIM800L + LiPo monitor)
  - Publishes location to MQTT: gpstracker/device/{DEVICE_ID}/location
  - Listens command topic:     gpstracker/device/{DEVICE_ID}/command (expects {"command":"PING"})

  Hardware
  - MCU: Arduino UNO (ATmega328P, 5V)
  - GNSS: Quectel L80 (NMEA @9600 baud, 3.3-5V tolerant TTL)
  - GSM/GPRS MQTT: SIM800L (3.7-4.2V LiPo; use proper power supply), TinyGSM
  - LiPo monitor: A0 via voltage divider (e.g., R1=100k to Vbat, R2=100k to GND), scale to percentage

  Libraries (install via Arduino Library Manager)
  - TinyGPS++
  - PubSubClient
  - TinyGSM
  - ArduinoJson (optional but not required; we build JSON manually)

  Notes
  - SIM800L requires stable power (2A peak). Use buck module + large capacitors.
  - Set your APN, MQTT broker, and credentials below.
  - DEVICE_ID must match the one registered in the web app.
*/

#include <SoftwareSerial.h>
#include <TinyGPS++.h>
#include <TinyGsmClient.h>
#include <PubSubClient.h>

// -------------------- User Config --------------------
#define DEVICE_ID        "AGPS1325"          // TODO: set your unique deviceId
#define GSM_BAUD         9600
#define GPS_BAUD         9600
#define TINY_GSM_MODEM_SIM800

// GSM pins (to SIM800L)
// UNO pins: 8 -> SIM800 TX, 9 -> SIM800 RX (crossed)
SoftwareSerial SerialGSM(8, 9); // RX, TX

// GPS pins (to Quectel L80)
// UNO pins: 4 -> L80 TX, 5 -> L80 RX (crossed)
SoftwareSerial SerialGPS(4, 5); // RX, TX

// Power / ADC
const int VBAT_PIN = A0;               // LiPo sense via divider
const float VBAT_R1 = 100000.0;        // to Vbat (ohms)
const float VBAT_R2 = 100000.0;        // to GND (ohms)
const float ADC_REF = 5.0;             // UNO analog reference (default 5V)
const int   ADC_RES = 1023;            // 10-bit ADC

// Cellular APN
const char APN[]      = "your.apn";    // e.g., "internet"
const char GPRS_USER[] = "";
const char GPRS_PASS[] = "";

// MQTT Broker
const char* MQTT_HOST = "broker.hivemq.com"; // or your backend broker host/IP
const uint16_t MQTT_PORT = 1883;
const char* MQTT_USER = ""; // if required
const char* MQTT_PASS = ""; // if required

// Topic format
// pub: gpstracker/device/{DEVICE_ID}/location
// sub: gpstracker/device/{DEVICE_ID}/command
String topicPub()  { return String("gpstracker/device/") + DEVICE_ID + "/location"; }
String topicCmd()  { return String("gpstracker/device/") + DEVICE_ID + "/command"; }

// Publish interval
const unsigned long PUB_INTERVAL_MS = 15000UL; // 15s

// -----------------------------------------------------
TinyGPSPlus gps;
TinyGsm modem(SerialGSM);
TinyGsmClient gsmClient(modem);
PubSubClient mqtt(gsmClient);

unsigned long lastPub = 0;
int lastSatellites = -1;

// Forward decl
void ensureMqtt();
void publishLocation(bool force = false);
void onMqttMessage(char* topic, byte* payload, unsigned int len);
float readBatteryPercent();

void setup() {
  // Serial for debug
  Serial.begin(115200);
  delay(400);
  Serial.println(F("\n[BOOT] UNO + L80 + SIM800L starting"));

  // GPS and GSM serials
  SerialGPS.begin(GPS_BAUD);
  SerialGSM.begin(GSM_BAUD);

  // Bring up modem
  Serial.println(F("[GSM] Initializing modem..."));
  modem.restart();
  String modemInfo = modem.getModemInfo();
  Serial.print(F("[GSM] Modem: ")); Serial.println(modemInfo);

  Serial.print(F("[GSM] Waiting for network..."));
  if (!modem.waitForNetwork()) {
    Serial.println(F(" fail"));
  } else {
    Serial.println(F(" ok"));
  }

  Serial.print(F("[GPRS] Connecting APN..."));
  if (!modem.gprsConnect(APN, GPRS_USER, GPRS_PASS)) {
    Serial.println(F(" fail"));
  } else {
    Serial.println(F(" ok"));
  }

  // MQTT
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);

  pinMode(VBAT_PIN, INPUT);
}

void loop() {
  // Feed GPS parser
  while (SerialGPS.available()) {
    gps.encode(SerialGPS.read());
  }

  // Keep MQTT connected
  ensureMqtt();
  mqtt.loop();

  // Publish periodically
  unsigned long now = millis();
  if (now - lastPub >= PUB_INTERVAL_MS) {
    lastPub = now;
    publishLocation(false);
  }
}

void ensureMqtt() {
  if (mqtt.connected()) return;

  Serial.print(F("[MQTT] Connecting... "));
  String clientId = String("uno-") + DEVICE_ID;
  if (MQTT_USER && MQTT_USER[0]) {
    if (!mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
      Serial.print(F("failed, rc=")); Serial.println(mqtt.state());
      delay(2000);
      return;
    }
  } else {
    if (!mqtt.connect(clientId.c_str())) {
      Serial.print(F("failed, rc=")); Serial.println(mqtt.state());
      delay(2000);
      return;
    }
  }
  Serial.println(F("connected"));

  // Subscribe command topic
  String sub = topicCmd();
  mqtt.subscribe(sub.c_str());
  Serial.print(F("[MQTT] Subscribed: ")); Serial.println(sub);
}

static String jsonEscape(const String& s) {
  String out; out.reserve(s.length()+4);
  for (size_t i=0;i<s.length();i++) {
    char c=s[i];
    if (c=='"' || c=='\\') { out += '\\'; out += c; }
    else if (c=='\n') out += "\\n";
    else out += c;
  }
  return out;
}

void publishLocation(bool force) {
  // Gather GPS
  bool hasFix = gps.location.isValid() && gps.location.age() < 5000;
  double lat = hasFix ? gps.location.lat() : 0.0;
  double lon = hasFix ? gps.location.lng() : 0.0;
  double spdKmph = gps.speed.isValid() ? gps.speed.kmph() : 0.0;
  int sats = gps.satellites.isValid() ? gps.satellites.value() : -1;
  double hdop = gps.hdop.isValid() ? gps.hdop.hdop() : 0.0; // accuracy proxy (smaller=better)

  // Read battery percentage
  float battPct = readBatteryPercent();

  // Build JSON
  String payload = "{";
  payload += "\"latitude\":" + String(lat, 6) + ",";
  payload += "\"longitude\":" + String(lon, 6) + ",";
  payload += "\"speed\":" + String(spdKmph, 1) + ",";
  if (hdop > 0.0) payload += "\"accuracy\":" + String(hdop, 1) + ","; // optional
  if (sats >= 0)  payload += "\"satellites\":" + String(sats) + ",";
  payload += "\"battery\":{\"level\":" + String((int)battPct) + ",\"isCharging\":false},";
  // timestamp omitted; backend will set now if absent
  payload += "\"timestamp\":\"\""; // send empty to keep valid JSON, backend ignores
  payload += "}";

  String topic = topicPub();
  bool ok = mqtt.publish(topic.c_str(), payload.c_str());
  Serial.print(F("[PUB] ")); Serial.print(topic); Serial.print(F(" => ")); Serial.println(payload);
  if (!ok) {
    Serial.println(F("[PUB] failed"));
  }
}

void onMqttMessage(char* topic, byte* payload, unsigned int len) {
  String t = String(topic);
  String msg; msg.reserve(len+1);
  for (unsigned int i=0;i<len;i++) msg += (char)payload[i];
  Serial.print(F("[CMD] ")); Serial.print(t); Serial.print(F(" => ")); Serial.println(msg);

  // Very simple parser: look for \"command\":\"PING\"
  if (msg.indexOf("\"command\"\s*:\s*\"PING\"") >= 0 || msg.indexOf("\"command\":\"PING\"") >= 0) {
    // Reply by publishing immediate location
    publishLocation(true);
  }
}

float readBatteryPercent() {
  // Read raw ADC and compute battery voltage using divider
  int raw = analogRead(VBAT_PIN);
  float vout = (raw * ADC_REF) / ADC_RES; // voltage at ADC pin
  float vin = vout * ((VBAT_R1 + VBAT_R2) / VBAT_R2);

  // Map voltage (3.3V..4.2V) to percentage (0..100)
  // Adjust these thresholds for your cell and load
  const float V_MIN = 3.3;
  const float V_MAX = 4.2;
  float pct = (vin - V_MIN) * 100.0 / (V_MAX - V_MIN);
  if (pct < 0) pct = 0; if (pct > 100) pct = 100;
  return pct;
}
