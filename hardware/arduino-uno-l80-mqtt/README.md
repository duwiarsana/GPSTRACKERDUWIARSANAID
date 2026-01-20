# Arduino UNO + Quectel L80 + SIM800L Firmware (MQTT)

Publishes GPS location to MQTT and listens to command topic. Designed to work with this repo's backend/frontend.

## Hardware
- MCU: Arduino UNO (ATmega328P)
- GNSS: Quectel L80 (UART 9600)
- GSM/GPRS: SIM800L (TinyGSM)
- Battery: LiPo monitored via ADC (voltage divider to A0)

## Topics
- Publish: `gpstracker/device/{DEVICE_ID}/location`
- Subscribe: `gpstracker/device/{DEVICE_ID}/command`
  - Expects `{ "command": "PING" }` to trigger immediate publish

## Payload example
```json
{
  "latitude": -6.200000,
  "longitude": 106.816666,
  "speed": 25.5,
  "accuracy": 1.2,
  "satellites": 8,
  "battery": { "level": 80, "isCharging": false },
  "timestamp": ""
}
```
Backend akan mengisi timestamp jika kosong.

## Konfigurasi
Edit di `firmware/uno_l80_mqtt.ino`:
- `DEVICE_ID` harus sama dengan yang didaftarkan di app.
- `APN`, `MQTT_HOST`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASS`.
- Ubah pin SoftwareSerial bila wiring berbeda.

## Wiring ringkas
- L80 TX -> UNO pin 4 (RX), L80 RX -> UNO pin 5 (TX)
- SIM800 TX -> UNO pin 8 (RX), SIM800 RX -> UNO pin 9 (TX)
- LiPo -> Divider R1=100k ke A0, R2=100k ke GND (tegangan ke A0 <= 5V)

## Build & Upload
- Board: Arduino UNO
- Library: TinyGPS++, TinyGSM, PubSubClient
- Upload via USB

## Catatan penting
- SIM800L butuh suplai stabil (2A peak). Gunakan buck + kapasitor besar.
- Antena GPS harus punya visibilitas langit untuk fix yang baik.
- Interval publish default 15s (atur `PUB_INTERVAL_MS`).
