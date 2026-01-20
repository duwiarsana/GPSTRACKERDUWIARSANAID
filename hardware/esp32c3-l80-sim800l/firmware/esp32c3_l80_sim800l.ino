/*
  GPS Tracker Firmware (ESP32-C3 + Quectel L80 + SIM800L)
  - Publishes location to MQTT: gpstracker/device/{DEVICE_ID}/location
  - Listens command topic:     gpstracker/device/{DEVICE_ID}/command (expects {"command":"PING"})

  Why ESP32-C3?
  - Multiple hardware UARTs -> stable concurrent GPS + modem I/O (no SoftwareSerial switching)
  - USB-CDC debug serial does not consume HW UARTs

  Libraries (Arduino Library Manager)
  - TinyGPS++
  - TinyGSM
  - PubSubClient

  Notes
  - Adjust pin defines below to your board wiring.
  - SIM800L needs strong power (2A peak). Use good DC-DC + bulk capacitors.
  - DEVICE_ID must match the one registered in the web app.
*/

#include <TinyGPS++.h>
#include <TinyGsmClient.h>
#include <PubSubClient.h>

// -------------------- User Config --------------------
#define DEVICE_ID        "AGPS1325"          // TODO: set your unique deviceId
#define TINY_GSM_MODEM_SIM800

// UART pins (adjust to your board)
// GPS (Quectel L80) -> UART1
#define GPS_RX_PIN   20  // L80 TX -> ESP32-C3 RX
#define GPS_TX_PIN   21  // L80 RX -> ESP32-C3 TX
#define GPS_BAUD     9600

// GSM (SIM800L) -> UART0
#define GSM_RX_PIN   4   // SIM800 TX -> ESP32-C3 RX
#define GSM_TX_PIN   5   // SIM800 RX -> ESP32-C3 TX
#define GSM_BAUD     9600

// Battery ADC
#define VBAT_PIN     2   // ADC pin; connect via divider (ensure <= 3.3V)
const float VBAT_R1 = 100000.0; // to Vbat (ohms)
const float VBAT_R2 = 100000.0; // to GND (ohms)

// Cellular APN
const char APN[]       = "your.apn";    // e.g., "internet"
const char GPRS_USER[] = "";
const char GPRS_PASS[] = "";

// MQTT Broker
const char* MQTT_HOST = "broker.hivemq.com"; // or your backend broker host/IP
const uint16_t MQTT_PORT = 1883;
const char* MQTT_USER = ""; // if required
const char* MQTT_PASS = ""; // if required

// Topic format
String topicPub()  { return String("gpstracker/device/") + DEVICE_ID + "/location"; }
String topicCmd()  { return String("gpstracker/device/") + DEVICE_ID + "/command"; }

// Publish interval
const unsigned long PUB_INTERVAL_MS = 15000UL; // 15s

// -----------------------------------------------------
HardwareSerial SerialGPS(1);
HardwareSerial SerialGSM(0);
TinyGPSPlus gps;
TinyGsm modem(SerialGSM);
TinyGsmClient gsmClient(modem);
PubSubClient mqtt(gsmClient);

unsigned long lastPub = 0;

// Forward decl
void ensureMqtt();
void publishLocation(bool force = false);
void onMqttMessage(char* topic, byte* payload, unsigned int len);
float readBatteryPercent();

void setup() {
  // USB CDC debug
  Serial.begin(115200);
  delay(300);
  Serial.println("\n[BOOT] ESP32-C3 + L80 + SIM800L");

  // Init UARTs
  SerialGPS.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  SerialGSM.begin(GSM_BAUD, SERIAL_8N1, GSM_RX_PIN, GSM_TX_PIN);

  // Modem bring-up
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
}

void loop() {
  // Feed GPS parser from hardware UART (non-blocking)
  while (SerialGPS.available()) {
    gps.encode(SerialGPS.read());
  }

  // Keep MQTT connected and process packets
  ensureMqtt();
  mqtt.loop();

  // Periodic publish
  const unsigned long now = millis();
  if (now - lastPub >= PUB_INTERVAL_MS) {
    lastPub = now;
    publishLocation(false);
  }
}

void ensureMqtt() {
  if (mqtt.connected()) return;

  Serial.print(F("[MQTT] Connecting... "));
  String clientId = String("c3-") + DEVICE_ID;
  bool ok = false;
  if (MQTT_USER && MQTT_USER[0]) ok = mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
  else ok = mqtt.connect(clientId.c_str());

  if (!ok) {
    Serial.print(F("failed, rc=")); Serial.println(mqtt.state());
    delay(2000);
    return;
  }
  Serial.println(F("connected"));

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
  payload += "\"timestamp\":\"\"";
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

  if (msg.indexOf("\"command\"\s*:\s*\"PING\"") >= 0 || msg.indexOf("\"command\":\"PING\"") >= 0) {
    publishLocation(true);
  }
}

float readBatteryPercent() {
  // ESP32-C3 ADC is 12-bit by default (0..4095) & 0..~3.3V, but actual attenuation depends on board
  uint16_t raw = analogRead(VBAT_PIN);
  const float ADC_RES = 4095.0;
  const float ADC_REF = 3.30; // approximate
  float vout = (raw * ADC_REF) / ADC_RES; // voltage at ADC pin
  float vin = vout * ((VBAT_R1 + VBAT_R2) / VBAT_R2);

  // Map 3.3V..4.2V to 0..100%
  const float V_MIN = 3.3;
  const float V_MAX = 4.2;
  float pct = (vin - V_MIN) * 100.0 / (V_MAX - V_MIN);
  if (pct < 0) pct = 0; if (pct > 100) pct = 100;
  return pct;
}
