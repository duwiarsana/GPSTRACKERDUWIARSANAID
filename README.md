# GPS Tracker

Real‑time GPS tracking system with a modern, glassmorphism dashboard. Fullscreen OpenStreetMap background, smooth panel animations, and real-time updates via Socket.IO. Includes optional MQTT integration for device location updates.

Sistem pelacakan GPS **real‑time** dengan tampilan dashboard modern bergaya glassmorphism. Menggunakan peta OpenStreetMap layar penuh, animasi panel yang halus, dan update posisi langsung via Socket.IO. Mendukung integrasi **MQTT** untuk pengiriman lokasi dari perangkat.

[Repo URL](https://github.com/duwiarsana/GPS-TRACKER-MQTT)

## Features / Fitur Utama

- **Device Management**: Register and manage GPS devices with unique IDs  
  *(Manajemen perangkat: daftar dan kelola perangkat GPS dengan ID unik)*
- **Real-time Tracking**: View device locations in real-time using WebSockets  
  *(Pelacakan real‑time: lihat posisi perangkat secara langsung melalui WebSocket)*
- **Historical Data**: Access and visualize historical location data  
  *(Data histori: akses dan visualisasikan riwayat lokasi perangkat)*
- **User Authentication**: Secure user authentication and authorization  
  *(Autentikasi pengguna: login aman dengan otorisasi berbasis peran)*
- **RESTful API**: Comprehensive API for integration with other systems  
  *(RESTful API: endpoint lengkap untuk integrasi dengan sistem lain)*
- **Responsive Dashboard**: Modern and responsive web interface  
  *(Dashboard responsif: tampilan modern yang nyaman di desktop maupun mobile)*
- **Map View Toggle**: Switch between latest-only marker vs full path, with date/time range filtering when showing the path  
  *(Tampilan peta fleksibel: bisa fokus ke titik terakhir saja atau seluruh jalur pergerakan dengan filter waktu)*
- **Trip Distance (Range-Based)**: When Show Path is enabled, the dashboard calculates total distance from the points currently shown on the map and displays it on the selected device card ("Jarak: X.XX km")  
  *(Jarak perjalanan (berdasarkan range): saat Show Path aktif, jarak total dihitung dari titik yang sedang ditampilkan dan ditampilkan di card device terpilih)*
- **Location History (Visits)**: Automatically aggregates nearby points into visits (≈25m enter / 35m exit radius, ≥30s dwell, last 24 hours only)  
  *(Riwayat lokasi (Visits): mengelompokkan titik yang berdekatan menjadi kunjungan otomatis untuk 24 jam terakhir)*
- **Address / Reverse Geocoding**: UI can show a human-readable address for coordinates via backend reverse geocoding proxy (to avoid browser CORS/403 issues)  
  *(Alamat / reverse geocoding: UI bisa menampilkan alamat dari koordinat via proxy backend agar tidak kena CORS/403 dari browser)*
- **Device Quick Stats**: Inline speed, altitude, satellites count, and color-coded battery level on device list  
  *(Statistik cepat: kecepatan, jumlah satelit, dan level baterai berwarna langsung di daftar perangkat)*
- **Status Markers**: Circle markers with black border; green when online, red when offline, with glass tooltip on hover showing name, speed, satellites, battery, and coordinates  
  *(Marker status: lingkaran hijau/merah dengan tooltip berisi nama, kecepatan, satelit, baterai, dan koordinat)*
- **Persisted Map View**: Remembers last center/zoom across refresh  
  *(Tampilan peta tersimpan: posisi dan zoom terakhir tetap diingat setelah refresh)*
- **Device Inactivity**: Auto-mark inactive after no heartbeat; optional Telegram alert with cooldown  
  *(Deteksi perangkat tidak aktif: otomatis menandai perangkat offline jika tidak ada data baru, dengan opsi notifikasi Telegram)*
- **Device Click Focus**: Clicking a device in the list will focus the map to its last known location (if available)  
  *(Fokus perangkat: klik perangkat untuk memusatkan peta ke posisi terakhirnya)*
- **Visit / Location Points Toggle**: Location History table can switch between clustered visits and raw location points (both limited to last 24 hours)  
  *(Tabel riwayat fleksibel: bisa pilih tampilan kunjungan (visit) atau titik mentah untuk 24 jam terakhir)*
- **Visit Locations Address Column**: Visit Locations table includes an Address (Alamat) column resolved via reverse geocoding (client-side cached)  
  *(Kolom alamat di tabel Visit Locations: alamat ditampilkan dan di-cache di sisi client agar tidak spam request)*
- **Telegram Bot Alerts (Optional)**: Geofence enter/exit and device active/inactive notifications sent to Telegram, including reverse-geocoded address and clickable Google Maps links  
  *(Notifikasi Telegram (opsional): geofence + perangkat aktif/non‑aktif dengan alamat (reverse geocode) dan link Google Maps yang bisa diklik)*

## What You Get / Apa yang Anda Dapatkan

- **Source Code Lengkap**  
  Backend (Node.js/Express/MongoDB), Frontend (React/Leaflet), serta konfigurasi Docker untuk mode development dan production.

- **Integrasi MQTT Siap Pakai**  
  Backend siap subscribe ke broker MQTT eksternal dengan topik `gpstracker/device/{deviceId}/location` dan format payload yang terdokumentasi dengan jelas.

- **Contoh Firmware Perangkat**  
  Folder `hardware/` berisi contoh firmware (ESP32 / Arduino + modul GPS & GSM) yang dapat langsung diadaptasi untuk perangkat nyata.

- **Dashboard Modern**  
  Tampilan peta fullscreen, riwayat 24 jam terakhir dengan clustering "visits", status perangkat (online/offline), dan geofence per perangkat.

- **Notifikasi Telegram (Opsional)**  
  Peringatan geofence dan perangkat aktif/non-aktif langsung ke Telegram, termasuk link Google Maps ke posisi terakhir.

- **Dokumentasi Deployment**  
  Contoh konfigurasi `.env`, script seed admin, dan Docker Compose untuk menjalankan aplikasi di VPS/Cloud.

## Tech Stack

- **Backend**: Node.js, Express, MongoDB (Mongoose)
- **Frontend**: React, Redux Toolkit, Material UI (v5)
- **Map**: React Leaflet + OpenStreetMap tiles
- **Auth**: JWT (JSON Web Tokens)
- **Realtime**: WebSocket (internal) / optional MQTT integration
- **Dev/Deploy**: Docker (MongoDB), npm workspaces

## Table of Contents

- [Quick Start (End-to-End)](#quick-start-end-to-end)
- [Prerequisites](#prerequisites)
- [Setup Instructions](#setup-instructions)
- [API](#api)
- [Device Integration (Optional MQTT)](#device-integration-optional-mqtt)
- [Database](#database)
- [WebSocket Events](#websocket-events)
- [Backend Environment Variables](#backend-environment-variables)
- [Troubleshooting (First Run)](#troubleshooting-first-run)
- [Production Deployment](#production-deployment)
- [Panduan Singkat Install di VPS (Untuk Client)](#panduan-singkat-install-di-vps-untuk-client)
- [Deploy to VPS/Cloud (Quick Guide)](#deploy-to-vpscloud-quick-guide)
- [Single-Origin Setup (Optional)](#single-origin-setup-optional)

## Quick Start (End-to-End)

From the monorepo root `gps-tracker`:

```bash
npm install
# start both backend (5050) and frontend (3000) with port auto-kill
npm run dev:all
```

Backend and frontend also support individual start scripts from their folders. Default credentials (if seeded): `admin@admin.com / admin123`.

### One-command startup (recommended)

If you use Docker for MongoDB, start everything with one command:

```bash
npm run dev:up
```

This will:

- Start MongoDB via docker compose (service `mongo`)
- Run backend and frontend concurrently

If you encounter a container name conflict, run:

```bash
npm run dev:reset-mongo
```

If you want to run each service separately:

```bash
# Terminal A
cd gps-tracker/backend && npm install && npm run dev
# Terminal B
cd gps-tracker/frontend && npm install && npm start
```

## Prerequisites

- Node.js (v18+ recommended)
- Docker (for MongoDB)
- npm or yarn

## Setup Instructions

### Backend Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/gps-tracker.git
   cd gps-tracker
   ```

2. Start MongoDB using Docker:

   ```bash
   docker compose up -d mongo
   ```

3. Backend dependencies and env:

   ```bash
   cd backend
   npm install
   ```

   Create `.env` (adjust values as needed):

   ```env
   # See backend/.env.example and copy to backend/.env
   NODE_ENV=development
   PORT=5050
   MONGODB_URI=mongodb://127.0.0.1:27017/gpstracker
   JWT_SECRET=your_jwt_secret_key_here
   JWT_EXPIRE=30d
   JWT_COOKIE_EXPIRE=7
   
   # Socket.IO server
   CORS_ORIGIN=*
   
   # MQTT (optional, enable if devices publish via broker)
   MQTT_BROKER_URL=mqtt://localhost:1883
   MQTT_TOPIC_PREFIX=gpstracker/device/
   
   # Device inactivity threshold (ms)
   # Device becomes Inactive (red) if no new data for this duration
   DEVICE_INACTIVE_TIMEOUT_MS=40000
   ```

6. (Optional) Run MongoDB via Docker Compose

   This repo includes `docker-compose.yml` to spin up MongoDB and mongo-express quickly.

   ```bash
   cd ../
   docker compose up -d
   # MongoDB: mongodb://127.0.0.1:27017
   # mongo-express UI: http://localhost:8081
   ```
   Ensure your backend `.env` uses `MONGODB_URI=mongodb://127.0.0.1:27017/gpstracker`.

7. (Optional) Dev Compose (Mongo + Backend + Frontend)

   Use the provided `docker-compose.dev.yml` to run everything with one command.

   ```bash
   docker compose -f docker-compose.dev.yml up -d
   # Frontend: http://localhost:3000
   # Backend API: http://localhost:5050/api/v1
   # MongoDB: mongodb://127.0.0.1:27017
   # mongo-express: http://localhost:8081
   ```

   Notes:

   - Backend container connects to Mongo via `mongodb://mongo:27017/gpstracker` (service name `mongo`).
   - Frontend container uses `REACT_APP_API_URL=http://localhost:5050/api/v1` by default, so no extra config needed.
   - To stop: `docker compose -f docker-compose.dev.yml down` (append `-v` to remove volumes).

4. Seed default admin user (idempotent):

   ```bash
   npm run seed:admin
   # Creates admin@admin.com / admin123 if not present
   ```

5. Start backend:

   ```bash
   npm run dev
   ```

### Frontend Setup

1. Install and configure:

   ```bash
   cd ../frontend
   npm install
   ```

   Create `.env`:

   ```env
   REACT_APP_API_URL=http://localhost:5050/api/v1
   ```

2. Start frontend:

   ```bash
   npm start
   ```

## API

Base URL (dev): `http://localhost:5050/api/v1`

### Reverse Geocoding

To avoid browser-side restrictions when calling Nominatim directly, the backend provides a proxy endpoint:

`GET /reverse-geocode?lat=<lat>&lng=<lng>`

Example:

```bash
curl "http://localhost:5050/api/v1/reverse-geocode?lat=-8.63&lng=115.21"
```

Response:

```json
{ "success": true, "address": "...", "raw": { /* upstream json */ } }
```

## Device Integration (Optional MQTT)

Perangkat dapat mengirim lokasi berkala ke topik MQTT berikut:

```text
gpstracker/device/{deviceId}/location
```

Di bawah ini adalah format payload yang direkomendasikan (JSON), contoh, serta aturan QoS/retain agar mempermudah implementasi firmware/hardware.

### Payload contoh (disarankan)

```json
{
  "latitude": -8.62657814849349,
  "longitude": 115.38612878012613,
  "speed": 25.5,
  "accuracy": 10,
  "altitude": 34.2,
  "battery": { "level": 77, "isCharging": false },
  "satellites": 7,
  "timestamp": "2025-11-21T02:22:00.000Z"
}
```

### Skema payload

- **latitude**: number (derajat), rentang -90..90. Wajib.
- **longitude**: number (derajat), rentang -180..180. Wajib.
- **speed**: number (km/jam). Opsional. Gunakan 0 jika diam.
- **accuracy**: number (meter, 1σ). Opsional. Abaikan jika modul tidak menyediakan.
- **altitude**: number (meter di atas permukaan laut). Opsional.
- **satellites**: integer (jumlah satelit fix). Opsional.
- **battery.level**: integer 0..100 (%). Opsional.
- **battery.isCharging**: boolean. Opsional.
- **timestamp**: string ISO8601 (UTC), contoh `2025-11-21T02:22:00.000Z`. Opsional; jika tidak ada, backend akan memakai waktu server.

Minimal yang diperlukan agar titik tersimpan: `latitude`, `longitude`.

### Topik, QoS, dan Retain

- **Topic**: `gpstracker/device/{deviceId}/location`
- **QoS**: 0 atau 1. Rekomendasi: QoS 0 untuk update berkala berfrekuensi tinggi; QoS 1 bila jaringan seluler tidak stabil.
- **Retain**: false (rekomendasi). Backend menyimpan state terakhir di DB, sehingga retained tidak diperlukan.
- **Encoding**: UTF-8, payload berformat JSON.

### Catatan implementasi firmware

- Kirim hanya saat ada perubahan signifikan atau interval tertentu (misal setiap 5–10 detik saat bergerak, 30–60 detik saat diam) untuk hemat kuota.
- Pastikan `deviceId` konsisten dengan yang terdaftar di backend.
- Jika mengirim `timestamp`, usahakan monoton meningkat. Jika tidak, backend akan fallback ke waktu server agar histori/visits tetap akurat.
- Toleransi parsing: backend akan mengabaikan field yang tidak dikenal, namun field wajib (lat/lng) harus valid.
- Disarankan set LWT (Last Will and Testament) di broker pada topik `gpstracker/device/{deviceId}/status` dengan payload `{"online":false}` untuk mendeteksi putus koneksi.

### Perilaku backend saat pesan diterima

- Memperbarui `Device.currentLocation` dan memancarkan `locationUpdate` via Socket.IO secara real-time.
- Menyimpan dokumen `Location` untuk histori/visits (menggunakan timestamp dari payload atau waktu server jika kosong/tidak valid).

## Database

MongoDB (default): `mongodb://127.0.0.1:27017/gpstracker`

Collections (simplified):
- `devices`
  - Fields: `deviceId` (string, unique), `name`, `isActive`, `lastSeen`, `currentLocation` (GeoJSON Point + telemetry), `user`
- `locations`
  - Fields: `device` (ObjectId -> devices), `location` (GeoJSON Point), `timestamp`, optional `speed`, `accuracy`, `altitude`, `battery`, `satellites`, `metadata`

Indexes (key ones):
- `locations.location` 2dsphere
- `locations.device + timestamp` (compound for history queries)

Sample queries (mongosh):
```js
use gpstracker
db.devices.find({}, { deviceId:1, name:1, isActive:1, lastSeen:1 }).pretty()
// Count locations for one deviceId
const dev = db.devices.findOne({ deviceId: 'AGPS2235' })
db.locations.countDocuments({ device: dev._id })
// Latest 20 points
db.locations.find({ device: dev._id }).sort({ timestamp: -1 }).limit(20)
```

Data flow:
1) MQTT/Simulator HTTP -> backend
2) Backend updates `devices.currentLocation` and emits `locationUpdate`
3) Backend saves `locations` for history/visits
4) Frontend receives Socket.IO and updates live marker; history is fetched via REST

Device inactivity:
- Backend resets a per-device timer on every message; if no message for `DEVICE_INACTIVE_TIMEOUT_MS` (default 40s), emits `deviceInactive`.
- Frontend marks device inactive and shows red marker; speed/satellites/battery display as `-` when inactive.

Inactivity timers are bootstrapped on backend startup (based on each device lastSeen/currentLocation timestamp), so inactivity alerts continue working after a backend restart.

Geofence:
- Each device can have a GeoJSON Polygon/MultiPolygon geofence.
- Marker color when active: green inside, yellow outside.
- Edit geofence from the Devices panel (map editor dialog).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Support

For support, please open an issue in the GitHub repository or contact the maintainers.

---

**Note**: This is a development version. For production deployment, make sure to:

- Use managed MongoDB and secure your JWT secrets
- Configure HTTPS/SSL
- Harden CORS and cookies
- Enable rate limiting and logging
- Use a production-ready MQTT broker if MQTT is required

## WebSocket Events

The frontend subscribes to these Socket.IO events emitted by the backend:

- `locationUpdate`: { deviceId, location: { type:'Point', coordinates:[lng,lat] }, speed?, accuracy?, altitude?, battery?, satellites?, timestamp? }
- `deviceHeartbeat`: { deviceId, lastSeen }
- `deviceInactive`: { deviceId }

These updates keep the device list and map in sync in real time.

In addition to WebSocket events, the backend can optionally send Telegram alerts (see below) when certain events occur.

## Backend Environment Variables

Create `backend/.env` with at least:

```env
# Core
NODE_ENV=development
PORT=5050
MONGODB_URI=mongodb://127.0.0.1:27017/gpstracker
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRE=30d
JWT_COOKIE_EXPIRE=30
CORS_ORIGIN=*

# MQTT (optional)
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_TOPIC_PREFIX=gpstracker/device/

# Inactivity (ms)
DEVICE_INACTIVE_TIMEOUT_MS=40000

# Telegram alerts (optional)
TELEGRAM_BOT_TOKEN=123456:telegram-bot-token-here
TELEGRAM_DEFAULT_CHAT_ID=123456789

# Cooldown (minutes) for repeated geofence alerts per device
TELEGRAM_COOLDOWN_MINUTES=3

# Minimum dwell time (seconds) outside geofence before sending an EXIT alert
TELEGRAM_DWELL_EXIT_SECONDS=30

# Cooldown (minutes) for device inactive/active alerts per device
TELEGRAM_DEVICE_INACTIVE_COOLDOWN_MINUTES=10
```

### Telegram Alerts (Optional)

If Telegram variables are configured, the backend will send messages to `TELEGRAM_DEFAULT_CHAT_ID` using `TELEGRAM_BOT_TOKEN`:

- **Device Inactive**
  - Trigger: no message for `DEVICE_INACTIVE_TIMEOUT_MS`.
  - Message: includes device ID, timestamp, last known coordinates, reverse-geocoded address (Alamat), and a clickable **Google Maps** link.
  - Cooldown: controlled by `TELEGRAM_DEVICE_INACTIVE_COOLDOWN_MINUTES` so repeated inactive/active flapping does not spam.
- **Device Active**
  - Trigger: device previously marked inactive becomes active again (new data received).
  - Message: includes device ID, timestamp, last known coordinates, address (Alamat), and Google Maps link.
- **Geofence Enter / Exit**
  - Each device can have a GeoJSON Polygon/MultiPolygon geofence.
  - Backend detects **enter** / **exit** transitions based on the current coordinate vs geofence.
  - Exit alerts are only sent after the device stays outside for at least `TELEGRAM_DWELL_EXIT_SECONDS` seconds to avoid jitter.
  - Cooldown per device per event type controlled by `TELEGRAM_COOLDOWN_MINUTES`.
  - Message: shows device name/ID, event type (ENTER/EXIT), coordinates, address (Alamat), and a clickable Google Maps link.

> Note: Telegram messages use HTML `parse_mode` with `<a href="...">Open in Google Maps</a>` links. Make sure your bot token and chat ID are valid and not committed to version control.

## Hardware (Optional)

Firmware examples are provided under `hardware/`:

- `arduino-uno-l80-mqtt/`: Arduino UNO + Quectel L80 + SIM800L (uses SoftwareSerial; limited throughput). Publishes MQTT location payloads.
- `esp32c3-l80-sim800l/`: ESP32‑C3 + Quectel L80 + SIM800L (hardware UARTs; more reliable). Supports receiving a `PING` command and publishing immediately.

Adjust broker credentials and topics in the sketches as needed.

## Device Deletion

- Deleting a device requires ownership or admin role.
- On delete, the backend removes the device and its location history.
- If the UI only knows `deviceId` (external), it resolves the MongoDB `_id` before calling the delete API.

## Troubleshooting

- Login fails / 401 / Network error:
  - Ensure backend is running on `PORT=5050` and frontend `.env` has `REACT_APP_API_URL=http://localhost:5050/api/v1`.
  - Confirm MongoDB is reachable (`MONGODB_URI`).
- Realtime updates not appearing:
  - Check browser console for WebSocket errors.
  - Verify backend logs show `Connected to MQTT Broker` and subscriptions if using MQTT.
- Delete device fails:
  - Ensure you’re the owner or admin.
  - Backend uses `deleteOne()` and also cleans up `Location` records.
- Map tiles blocked or slow:
  - Verify network connectivity to OpenStreetMap tile servers.
- Show Path range looks empty (no points):
  - Ensure date/time inputs are valid. The UI accepts both `HH:MM` and `HH.MM` formats for time, and supports `YYYY-MM-DD` as well as `DD/MM/YYYY` date display.

## Repo Scripts

From monorepo root `gps-tracker`:

```bash
npm run dev-backend   # nodemon backend on 5050
npm run dev-frontend  # CRA dev server on 3000
npm run dev:all       # run both concurrently
npm run dev:up        # compose mongo + run both concurrently
npm run dev:reset-mongo  # fix container name conflicts then bring mongo up
npm run setup         # install root + backend + frontend dependencies
```

## Development Architecture Model

- Frontend (React) and backend (Node/Express) run on the host in development.
- MongoDB runs in Docker (service name `mongo`, port 27017 published).
- Frontend API base URL:
  - Use `REACT_APP_API_URL` in `frontend/.env` to override, otherwise it falls back to `http(s)://<host>:5050/api/v1`.
- Backend connects to Mongo via `MONGODB_URI` (default `mongodb://127.0.0.1:27017/gpstracker`).

Tip: For an all-in-one Docker Compose dev (frontend+backend+mongo), see `docker-compose.dev.yml` section below.

## Seeding & Default Credentials

- Seed admin: `cd backend && npm run seed:admin`
- Default admin (if not present): `admin@admin.com / admin123`

## FAQ (Pertanyaan yang Sering Diajukan)

**Q: Apakah saya wajib menggunakan MQTT? Bisa pakai HTTP saja?**  
A: Aplikasi ini dirancang utama untuk menerima data lokasi via MQTT (`gpstracker/device/{deviceId}/location`). HTTP endpoint dasar tetap ada (untuk beberapa operasi API), tetapi integrasi perangkat lebih stabil dan scalable jika menggunakan MQTT broker.

**Q: Bagaimana cara mengganti alamat broker MQTT menjadi broker milik saya?**  
A: Edit file `backend/.env` (salinan dari `backend/.env.production.example`) dan ubah:

```env
MQTT_BROKER_URL=mqtt://your-broker-host:1883
MQTT_TOPIC_PREFIX=gpstracker/device/
```

Restart backend / stack Docker setelah mengubah nilai ini.

**Q: Berapa spesifikasi server minimum yang disarankan?**  
A: Untuk puluhan perangkat aktif secara bersamaan, rekomendasi awal:
- 2 vCPU
- 2–4 GB RAM
- Disk 20–40 GB
- Docker & Docker Compose terpasang  
Untuk ratusan perangkat, sesuaikan RAM/CPU dan gunakan broker MQTT yang andal.

**Q: Apakah data lokasi disimpan selamanya?**  
A: Secara default backend menyimpan semua histori lokasi di MongoDB, tetapi tampilan dashboard dan tabel riwayat fokus pada **24 jam terakhir** (clustering "visits" dan raw points). Retensi database bisa diatur manual oleh admin (misalnya lewat job cleanup eksternal).

**Q: Apakah aplikasi ini mendukung banyak user?**  
A: Ya. Sistem auth berbasis email/password dengan role admin. Admin bisa membuat beberapa device, dan dashboard bisa diakses dari banyak browser sekaligus. Multi-tenant penuh (perusahaan terpisah) belum dioptimalkan; saat ini cocok untuk satu organisasi/perusahaan per deploy.

**Q: Bisakah saya mengubah tampilan UI atau teks ke bahasa lain?**  
A: Bisa. Frontend menggunakan React + Material UI. Anda dapat mengubah komponen di folder `frontend/src/` (misalnya teks bahasa Indonesia/Inggris, warna, logo) lalu melakukan rebuild frontend (`npm run build` atau lewat Docker).

**Q: Bagaimana kalau saya ingin mengaktifkan notifikasi Telegram?**  
A: Isi variabel berikut di `backend/.env`:

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_DEFAULT_CHAT_ID=...
TELEGRAM_COOLDOWN_MINUTES=3
TELEGRAM_DWELL_EXIT_SECONDS=30
TELEGRAM_DEVICE_INACTIVE_COOLDOWN_MINUTES=10
```

Lalu restart backend. Setelah itu, geofence enter/exit dan status perangkat aktif/non-aktif akan dikirim ke Telegram dengan link Google Maps.

**Q: Apakah saya boleh mengubah source code?**  
A: Ya, source code ini bisa dimodifikasi sesuai kebutuhan proyek Anda (branding, fitur tambahan, integrasi lain). Untuk menjaga kompatibilitas, disarankan tetap mengikuti struktur folder dan format payload yang sudah ada.

## Troubleshooting (First Run)

- `concurrently: command not found`: run `npm install` in the monorepo root.
- Backend crashes with `ECONNREFUSED 127.0.0.1:27017`:
  - Ensure MongoDB is running: `docker compose up -d mongo`
  - If conflict: `npm run dev:reset-mongo`
  - Re-run the app: `npm run dev:all` or `npm run dev:up`
- Port in use (3000/5050/27017): stop conflicting processes or change the port.

## Production Deployment

This repo includes a production-ready Docker setup to run frontend, backend, and MongoDB with a single command.

### 1) Prepare environment

- Copy and adjust backend production env:

```bash
cp backend/.env.production.example backend/.env
# Edit backend/.env to set JWT_SECRET, CORS_ORIGIN, MQTT_BROKER_URL (optional), etc.
```

### 2) Start stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Services:

- Frontend (Nginx): <http://localhost> (port 80)
- Backend API: <http://localhost:5050/api/v1>
- MongoDB: mongodb://localhost:27017/gpstracker

Healthcheck: backend exposes GET /health returning `{ status: 'ok' }`.

### 3) Seed admin (optional)

```bash
docker compose -f docker-compose.prod.yml exec backend npm run seed:admin
# admin@admin.com / admin123 (change after first login)
```

### 4) Stop stack

```bash
docker compose -f docker-compose.prod.yml down
```

Security tips:

- Set a strong JWT_SECRET and restrict CORS_ORIGIN in backend/.env.
- Consider disabling mongo-express in production or protect it.
- Configure a managed MongoDB for production environments.

## Deploy to VPS/Cloud (Quick Guide)

Example (Ubuntu 22.04+):

```bash
# 1) Install Docker & Compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# 2) Clone project
git clone <your-repo-url>
cd gps-tracker

# 3) Prepare env and start
cp backend/.env.production.example backend/.env
docker compose -f docker-compose.prod.yml up -d --build

# 4) Seed admin (optional)
docker compose -f docker-compose.prod.yml exec backend npm run seed:admin
```

Notes:

- Open ports 80 (HTTP) and 5050 (API) in firewall/security group.
- Set strong `JWT_SECRET` and restrict `CORS_ORIGIN` in backend/.env.
- Consider enabling HTTPS via a reverse proxy (Caddy/Traefik/Nginx with certbot).

## Panduan Singkat Install di VPS (Untuk Client)

Contoh untuk VPS Ubuntu 22.04 (baru/bersih):

1. **Install Docker & Docker Compose plugin**

   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER && newgrp docker
   ```

2. **Upload & Ekstrak Source Code**

   - Upload file ZIP proyek ke VPS (misalnya ke `/opt/gps-tracker`).
   - Ekstrak:

     ```bash
     cd /opt
     unzip gps-tracker-release.zip -d gps-tracker
     cd gps-tracker
     ```

3. **Siapkan Environment Backend**

   ```bash
   cp backend/.env.production.example backend/.env
   nano backend/.env
   ```

   Minimal yang perlu diubah:

   - `JWT_SECRET` → ganti dengan string rahasia yang kuat.
   - `CORS_ORIGIN` → set ke domain/frontend yang akan dipakai.
   - `MQTT_BROKER_URL` → alamat MQTT broker Anda, misalnya `mqtt://your-broker:1883`.
   - (Opsional) variabel Telegram jika ingin notifikasi.

4. **Jalankan Aplikasi dengan Docker (Production)**

   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

   Layanan default:

   - Frontend: `http://<IP_VPS>` (port 80)
   - API backend: `http://<IP_VPS>:5050/api/v1`
   - MongoDB berjalan di dalam container (tidak perlu diakses langsung dari luar).

5. **Buat Akun Admin**

   ```bash
   docker compose -f docker-compose.prod.yml exec backend npm run seed:admin
   ```

   Login awal:

   - Email: `admin@admin.com`
   - Password: `admin123` (segera ubah dari dashboard setelah login).

6. **Koneksi Perangkat ke MQTT**

   - Pastikan perangkat Anda publish ke broker MQTT yang sama dengan `MQTT_BROKER_URL`.
   - Topic: `gpstracker/device/{deviceId}/location`
   - Format payload JSON mengikuti contoh di bagian **Device Integration (Optional MQTT)**.

Setelah langkah di atas, dashboard GPS Tracker sudah bisa diakses dari browser dan siap digunakan untuk memantau perangkat Anda.

## Single-Origin Setup (Optional)

If you prefer frontend and API on the same origin (no CORS), proxy API via Nginx inside the frontend container.

Steps:

1) Edit `frontend/nginx.conf` and uncomment the `/api/` location block to proxy to `backend:5050`.
2) Ensure frontend calls `/api/v1/...` (relative path) instead of absolute `http://localhost:5050/api/v1`.
3) Rebuild and start:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Now both UI and API are served from the same origin on port 80.
