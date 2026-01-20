# ESP32-C3 + Quectel L80 + SIM800L (Hybrid) Firmware

Publishes GPS location to MQTT via SIM800L and listens to command topic. Uses hardware UARTs for stable concurrent I/O.

## Pins (default in sketch)
- GPS L80 (UART1)
  - L80 TX -> ESP32-C3 RX (GPIO 20)
  - L80 RX -> ESP32-C3 TX (GPIO 21)
  - Baud: 9600
- SIM800L (UART0)
  - SIM800 TX -> ESP32-C3 RX (GPIO 4)
  - SIM800 RX -> ESP32-C3 TX (GPIO 5)
  - Baud: 9600
- Battery ADC
  - LiPo -> divider -> ESP32-C3 ADC (GPIO 2). Pastikan tegangan ke pin <= 3.3V

Ubah pin di `#define` jika board berbeda.

## Konfigurasi
Edit di `firmware/esp32c3_l80_sim800l.ino`:
- `DEVICE_ID` harus sesuai di app.
- `APN`, `MQTT_HOST`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASS`.

## Topics
- Publish: `gpstracker/device/{DEVICE_ID}/location`
- Subscribe: `gpstracker/device/{DEVICE_ID}/command` ("PING" memicu publish segera)

## Payload example
```json
{
  "latitude": -8.62657814849349,
  "longitude": 115.38612878012613,
  "speed": 25.5,
  "accuracy": 10,
  "battery": { "level": 77, "isCharging": false },
  "satellites": 7,
  "timestamp": "2025-11-21T02:22:00.000Z"
}
```

### Skema singkat

- `latitude` (derajat, -90..90) wajib
- `longitude` (derajat, -180..180) wajib
- `speed` (km/jam) opsional
- `accuracy` (meter) opsional
- `satellites` (jumlah satelit) opsional
- `battery.level` (0..100 %) opsional
- `battery.isCharging` (boolean) opsional
- `timestamp` (ISO8601 UTC) opsional; jika kosong backend pakai waktu server

### QoS/retain

- QoS 0 atau 1 (rekomendasi: QoS 0 untuk update berkala; QoS 1 jika jaringan tidak stabil)
- Retain = false (rekomendasi)
- Lihat detail lengkap di README utama bagian "Device Integration (Optional MQTT)"

## Catatan
- Pastikan suplai SIM800L kuat (peak 2A) dan gunakan kapasitor buffer.
- Antena GPS butuh visibilitas langit untuk fix yang baik.
- Interval publish default 15s (`PUB_INTERVAL_MS`).
