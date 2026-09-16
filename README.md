# Fire Detection System - Hệ Thống Phát Hiện Cháy Thông Minh

## Mục Lục

- [Tổng Quan](#-tổng-quan)
- [Kiến Trúc Hệ Thống](#-kiến-trúc-hệ-thống)
- [Tính Năng Chính](#-tính-năng-chính)
- [Cấu Trúc Dự Án](#-cấu-trúc-dự-án)
- [Công Nghệ Sử Dụng](#-công-nghệ-sử-dụng)
- [Phần Cứng](#-phần-cứng-iot)
- [Hướng Dẫn Cài Đặt](#-hướng-dẫn-cài-đặt)
  - [Backend & Dịch Vụ Nền](#1-backend--dịch-vụ-nền-docker)
  - [AI Worker (Python)](#2-ai-worker-python)
  - [Frontend](#3-frontend-react)
  - [Firmware Arduino](#4-firmware-arduino--platformio)
- [Biến Môi Trường](#-biến-môi-trường)
- [MQTT Topics](#-mqtt-topics)
- [Luồng Hoạt Động](#-luồng-hoạt-động)
- [API Endpoints](#-api-endpoints)
- [Cấu Hình & Tuning](#-cấu-hình--tuning)

---

## Tổng Quan

**Fire Detection System** là một hệ thống IoT phát hiện cháy toàn diện, kết hợp **phần cứng nhúng (ESP32)**, **AI nhận diện lửa (YOLOv8)** và **dashboard web thời gian thực**. Hệ thống có thể phát hiện cháy qua nhiều nguồn độc lập (camera AI, cảm biến nhiệt độ, cảm biến khí gas, cảm biến khói, cảm biến lửa hồng ngoại) và đưa ra cảnh báo tức thì qua còi báo động, thông báo đẩy (FCM) và giao diện web.

### Điểm nổi bật:
- **Phát hiện đa cảm biến** - Kết hợp AI camera + cảm biến vật lý để giảm false positive
- **Cảnh báo tức thì** - Alert gửi ngay khi phát hiện, không chờ ghi xong video
- **Ghi hình trước + sau sự kiện** - Buffer 30s trước và 30s sau khi phát hiện cháy
- **Auto-discovery thiết bị** - ESP32 tự đăng ký với backend qua MQTT beacon
- **Push notification FCM** - Thông báo đẩy đến điện thoại qua Firebase Cloud Messaging
- **Realtime dashboard** - Xem camera trực tiếp và nhận cảnh báo qua WebSocket (Socket.IO)
- **PWA ready** - Frontend có thể cài đặt như ứng dụng native

---

## Kiến Trúc Hệ Thống

```
┌─────────────────────────────────────────────────────────────────┐
│                         PHẦN CỨNG IoT                          │
│                                                                 │
│  ┌─────────────────────┐    ┌──────────────────────────────┐   │
│  │   ESP32-CAM (01)    │    │     ESP32 NoCam (02)         │   │
│  │  • Camera OV2640    │    │  • Cảm biến DHT11 (Nhiệt/Ẩm)│   │
│  │  • Cảm biến Khói    │    │  • Cảm biến MQ2 (Gas)       │   │
│  │  • Cảm biến Lửa IR  │    │  • Buzzer + Đèn Alert       │   │
│  │  • Buzzer + LED     │    │  • WiFiManager (AP config)   │   │
│  │  • MJPEG Stream     │    │  • MQTT via PubSubClient     │   │
│  │  • MQTT PubSubClient│    └──────────────┬───────────────┘   │
│  └──────────┬──────────┘                   │                   │
└─────────────┼───────────────────────────── │ ──────────────────┘
              │   MQTT (TCP 1883)             │
              ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   ECLIPSE MOSQUITTO BROKER                      │
│              (Docker Container, port 1883)                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
         ┌─────────────────┼──────────────────────┐
         │                 │                      │
         ▼                 ▼                      ▼
┌─────────────┐   ┌─────────────────┐   ┌────────────────────┐
│  AI Worker  │   │  NestJS Backend  │   │  React Frontend    │
│  (Python)   │   │  (TypeScript)    │   │  (Vite + PWA)      │
│             │   │                  │   │                    │
│ • YOLOv8    │   │ • REST API       │   │ • Dashboard        │
│ • OpenCV    │   │ • WebSocket      │   │ • Camera View      │
│ • paho-mqtt │   │   (Socket.IO)    │   │ • Alert History    │
│ • Video Buf │   │ • MQTT Client    │   │ • Room/Camera Mgmt │
│ • Alert Mgr │   │ • PostgreSQL     │   │ • FCM Notif.       │
│ • Frame Pub │   │ • Firebase FCM   │   │ • Socket.IO client │
│             │   │ • JWT Auth       │   │                    │
└──────┬──────┘   └────────┬─────────┘   └────────────────────┘
       │                   │
       │   MQTT topics     │   HTTP REST + WebSocket
       └───────────────────┘
                   │
                   ▼
         ┌──────────────────┐
         │   PostgreSQL DB  │
         │   (Docker 15)    │
         │                  │
         │ • users          │
         │ • rooms          │
         │ • cameras        │
         │ • fire_alerts    │
         └──────────────────┘
```

---

## Tính Năng Chính

### Giám Sát Camera Thời Gian Thực
- Stream video trực tiếp từ ESP32-CAM qua MJPEG
- AI Worker nhận frame, chạy **YOLOv8** nhận diện lửa và gửi frame qua MQTT (base64)
- Backend relay frame qua **Socket.IO** tới frontend
- Hiển thị timestamp và tên camera được vẽ lên từng frame

### Phát Hiện Cháy Đa Nguồn
Hệ thống đánh giá trạng thái báo động dựa trên **tất cả các cảm biến đã bật** của camera:

| Nguồn cảm biến | Mô tả |
|---|---|
| **AI Camera (YOLOv8)** | Nhận diện lửa trong video frame với confidence threshold tùy chỉnh |
| **Nhiệt độ** | Ngưỡng nhiệt độ tối đa cấu hình trên từng camera |
| **Khí gas (%)** | Ngưỡng nồng độ gas từ cảm biến MQ2 |
| **Cảm biến khói** | Digital signal từ module cảm biến khói |
| **Cảm biến lửa IR** | Digital signal từ module cảm biến lửa hồng ngoại |

> **Logic AND**: Báo động chỉ kích hoạt khi **tất cả** cảm biến đã bật đều triggered - giảm thiểu false positive.

### Quy Trình Cảnh Báo Tức Thì
1. AI Worker phát hiện lửa → **gửi MQTT ngay lập tức**
2. Backend tạo Alert record trong DB ngay, **không chờ hình ảnh/video**
3. Frontend nhận WebSocket event `FIRE_ALARM` → hiển thị toast ngay
4. FCM push notification gửi đến điện thoại ngay lập tức
5. Còi buzzer trên ESP32 được kích hoạt qua MQTT command
6. **Song song**: AI Worker ghi video buffer 30s trước + 30s sau sự kiện
7. Sau 30s, video hoàn chỉnh được di chuyển sang `saved_videos/`, Backend cập nhật DB

### Ghi Hình Sự Kiện (Pre/Post Buffer)
- Buffer xoay vòng liên tục lưu **30 giây trước** sự kiện trong RAM
- Khi có cháy, thread ngầm tiếp tục thu thập **30 giây sau** sự kiện
- Video xuất ra định dạng **WebM (VP8)** kèm timestamp và tên camera
- **Cooldown 30 giây** giữa các lần ghi tránh spam file

### Thông Báo FCM (Firebase Cloud Messaging)
- Người dùng đăng ký FCM token khi đăng nhập vào web app
- Backend dùng **Firebase Admin SDK** gửi push notification data-only
- Frontend hiển thị **Toast in-app** khi đang mở ứng dụng (foreground FCM)
- Thông báo chứa tên camera, tên phòng, thời gian và URL ảnh chụp

### Quản Lý Phòng & Camera
- Tổ chức camera theo **phòng (Room)**
- Cấu hình ngưỡng cảm biến riêng cho từng camera
- Bật/tắt các loại cảm biến độc lập cho từng camera
- **Auto-discovery**: ESP32 tự gửi beacon mỗi 60s, backend tự tạo/cập nhật camera record

### Dashboard Tổng Quan
- Lưới camera 2×2, xem trực tiếp tất cả camera cùng lúc
- Biểu đồ nhiệt độ và nồng độ gas realtime (Recharts)
- Chỉ số trạng thái online/offline của từng thiết bị

### Lịch Sử Cảnh Báo
- Danh sách đầy đủ các lần phát hiện cháy
- Xem ảnh chụp tại thời điểm sự kiện
- Phát lại video ghi lại sự kiện
- Lọc theo camera, phòng, thời gian

---

## Cấu Trúc Dự Án

```
fire-detection/
│
├── arduino/                          # Firmware cho thiết bị nhúng (PlatformIO)
│   ├── ESP32_CAM_fire_01/            # ESP32-CAM: Stream video + cảm biến cơ bản
│   │   ├── src/
│   │   │   ├── main.cpp              # Logic chính: WiFi, MQTT, MJPEG stream, sensors
│   │   │   └── OV2640.cpp            # Driver camera OV2640
│   │   └── platformio.ini            # Cấu hình board esp32cam, thư viện
│   │
│   └── ESP32_fire_02/                # ESP32 (không có cam): Cảm biến đầy đủ
│       ├── src/
│       │   └── main.cpp              # Logic chính: DHT11, MQ2, Buzzer, LED Alert
│       └── platformio.ini            # Cấu hình board esp32dev
│
├── ai_worker/                        # AI Detection Worker (Python)
│   ├── main.py                       # Entry point: Vòng lặp đọc frame, chạy YOLO
│   ├── config.py                     # Tất cả hằng số cấu hình (MQTT, path, FPS...)
│   ├── mqtt_manager.py               # Quản lý kết nối MQTT (pub/sub, retry, queue)
│   ├── alert_manager.py              # Ghi ảnh/video, gửi alert, xử lý lệnh Backend
│   ├── video_stream.py               # Đọc stream video (webcam/URL) với reconnect
│   ├── best.pt                       # Model YOLOv8 đã train nhận diện lửa
│   ├── saved_images/                 # Ảnh chụp sự kiện đã được xác nhận
│   │   └── temp/                     # Ảnh tạm (chưa được xác nhận bởi Backend)
│   └── saved_videos/                 # Video sự kiện đã được xác nhận
│       └── temp/                     # Video tạm (đang ghi hoặc chờ xác nhận)
│
├── backend-fire-detection/           # NestJS API Server
│   ├── src/
│   │   ├── alerts/                   # Module cảnh báo (CRUD alert, update media)
│   │   ├── auth/                     # JWT Authentication (login, register, logout)
│   │   ├── cameras/                  # Quản lý camera (CRUD, discovery, status)
│   │   ├── gateway/                  # Socket.IO Gateway (WebSocket broadcast)
│   │   ├── mqtt/                     # MQTT Controller + Service (xử lý tất cả topics)
│   │   ├── notifications/            # Firebase FCM push notification
│   │   ├── rooms/                    # Quản lý phòng (CRUD)
│   │   ├── storage/                  # Serve static files (ảnh/video từ ai_worker)
│   │   ├── users/                    # Quản lý người dùng (profile, FCM token)
│   │   ├── app.module.ts             # Root module (TypeORM, ServeStatic config)
│   │   └── main.ts                   # Bootstrap (CORS, Validation, MQTT microservice)
│   ├── docker-compose.yaml           # Khởi động PostgreSQL + Mosquitto + NestJS
│   ├── Dockerfile                    # Build image NestJS
│   ├── mosquitto.conf                # Cấu hình MQTT Broker (allow anonymous)
│   └── .env.example                  # Mẫu biến môi trường Backend
│
└── frontend-fire-detection/          # React Web App (Vite + PWA)
    ├── src/
    │   ├── pages/
    │   │   ├── OverviewDashboard.jsx # Dashboard tổng quan, lưới camera realtime
    │   │   ├── CameraView.jsx        # Xem chi tiết 1 camera (stream + alerts + sensors)
    │   │   ├── AlertHistory.jsx      # Lịch sử toàn bộ cảnh báo (ảnh, video, lọc)
    │   │   ├── CameraManagement.jsx  # Thêm/sửa/xóa camera, cấu hình cảm biến
    │   │   ├── RoomManagement.jsx    # Thêm/sửa/xóa phòng
    │   │   ├── ProfilePage.jsx       # Thông tin cá nhân, đổi mật khẩu
    │   │   ├── LoginPage.jsx         # Đăng nhập
    │   │   └── RegisterPage.jsx      # Đăng ký tài khoản
    │   ├── components/
    │   │   ├── Sidebar.jsx           # Sidebar điều hướng (responsive, camera status)
    │   │   ├── CameraInfoPanel.jsx   # Panel thông tin sensor theo thời gian thực
    │   │   ├── CameraAlertsList.jsx  # Danh sách alert của 1 camera
    │   │   └── RightPanel.jsx        # Panel bên phải trong CameraView
    │   ├── context/
    │   │   └── AppContext.jsx        # Global state (user, rooms, cameras, sockets)
    │   ├── utils/
    │   │   ├── axios.js              # Axios instance (baseURL, withCredentials)
    │   │   └── firebase.js           # FCM init, getToken, onMessageListener
    │   └── App.jsx                   # Router (ProtectedRoute, AppShell layout)
    └── .env.example                  # Mẫu biến môi trường Frontend
```

---

## Công Nghệ Sử Dụng

### Backend
| Công nghệ | Version | Mục đích |
|---|---|---|
| **NestJS** | v11 | REST API framework, Microservice |
| **TypeORM** | v0.3 | ORM cho PostgreSQL |
| **PostgreSQL** | 15 | Cơ sở dữ liệu chính |
| **Socket.IO** | v4 | WebSocket realtime |
| **MQTT (paho)** | v5 | Nhận/gửi lệnh IoT |
| **Eclipse Mosquitto** | v2 | MQTT Broker |
| **Firebase Admin SDK** | v14 | Gửi FCM push notification |
| **Passport + JWT** | - | Xác thực người dùng |
| **bcrypt** | v6 | Hash mật khẩu |
| **@nestjs/schedule** | - | Cron job định kỳ |

### Frontend
| Công nghệ | Version | Mục đích |
|---|---|---|
| **React** | v19 | UI Framework |
| **Vite** | v8 | Build tool + Dev server |
| **React Router** | v7 | Client-side routing |
| **Socket.IO Client** | v4 | Kết nối WebSocket backend |
| **Axios** | v1 | HTTP client với cookies |
| **Firebase SDK** | v12 | FCM foreground messages |
| **Recharts** | v3 | Biểu đồ sensor realtime |
| **React Icons** | v5 | Icon library |
| **vite-plugin-pwa** | - | Progressive Web App |

### AI Worker
| Công nghệ | Mục đích |
|---|---|
| **YOLOv8 (Ultralytics)** | Nhận diện lửa trong video frame |
| **OpenCV** | Đọc stream, resize, encode JPEG, ghi video |
| **paho-mqtt** | Kết nối MQTT Broker |
| **Python Threading** | Ghi video bất đồng bộ, không block main loop |

### Firmware IoT
| Thư viện | Mục đích |
|---|---|
| **PubSubClient** | MQTT client cho ESP32 |
| **WiFiManager** | Cấu hình WiFi qua captive portal AP |
| **Preferences** | Lưu cấu hình server vào Flash |
| **DHT sensor** | Đọc nhiệt độ và độ ẩm (DHT11) |
| **esp_camera** | Driver camera OV2640 cho ESP32-CAM |

---

## Phần Cứng IoT

### Device 1: ESP32-CAM (AI Thinker)
**File firmware:** [`arduino/ESP32_CAM_fire_01`](./arduino/ESP32_CAM_fire_01/)

| Chân | Thiết bị | Ghi chú |
|---|---|---|
| GPIO 2 | Cảm biến lửa (Flame sensor) | Tích cực cao |
| GPIO 13 | Cảm biến khói (Smoke/MQ sensor) | Tích cực thấp (đảo) |
| GPIO 14 | Còi báo động (Buzzer) | Active HIGH |
| GPIO 15 | LED trạng thái | Active LOW |
| GPIO 12 | Nút Reset | INPUT_PULLUP, nhấn giữ 5s |

**Tính năng:**
- Khởi động AP WiFiManager `ESP32-CAM-FireAlarm` để cấu hình WiFi và IP MQTT Server
- Stream MJPEG tại `http://<IP>/mjpeg/1` và ảnh tĩnh tại `http://<IP>/jpg`
- Gửi MQTT topic `sensors/<MAC>`: `{"smoke": 0, "flame": 1}` mỗi 5 giây
- Gửi beacon discovery `discovery/cameras` mỗi 60 giây
- Nhận lệnh buzzer từ topic `commands/<MAC>`: `{"buzzer": 1/0}`
- LED nháy theo trạng thái: nhanh (no WiFi) → vừa (no MQTT) → chậm (ok)
- Last Will Testament (LWT) để backend biết khi thiết bị mất kết nối

### Device 2: ESP32 NoCam (DevKit)
**File firmware:** [`arduino/ESP32_fire_02`](./arduino/ESP32_fire_02/)

| Chân | Thiết bị | Ghi chú |
|---|---|---|
| GPIO 4 | DHT11 | Nhiệt độ + độ ẩm |
| GPIO 34 | MQ2 (Analog) | Nồng độ khí gas |
| GPIO 18 | Còi báo động (Buzzer) | Active HIGH |
| GPIO 13 | Đèn Alert phụ | Active HIGH |
| GPIO 2 | LED trạng thái | Active HIGH |
| GPIO 15 | Nút Reset | INPUT_PULLUP, nhấn giữ 5s |

**Tính năng:**
- Đọc nhiệt độ/độ ẩm từ DHT11, khí gas từ MQ2 (map sang 0-100%)
- Gửi MQTT topic `sensors/<MAC>`: `{"temperature": 25.0, "humidity": 60.0, "gasPercent": 5}` mỗi 5 giây
- Gửi beacon discovery `discovery/cameras` mỗi 60 giây với `type: "esp32-nocam"`
- Bật cả Buzzer + đèn Alert khi nhận lệnh `{"buzzer": 1}`

---

## Hướng Dẫn Cài Đặt

### Yêu cầu hệ thống
- Docker & Docker Compose
- Node.js 20+
- Python 3.10+
- PlatformIO (cho firmware Arduino)

---

### 1. Backend & Dịch Vụ Nền (Docker)

```bash
cd backend-fire-detection

# 1. Tạo file môi trường từ mẫu
cp .env.example .env
# → Chỉnh sửa .env với thông tin của bạn (xem phần Biến Môi Trường bên dưới)

# 2. Đặt Firebase Service Account Key
# Tải serviceAccountKey.json từ Firebase Console → Project Settings → Service Accounts
# Đặt file vào: backend-fire-detection/serviceAccountKey.json

# 3. Khởi động tất cả service (PostgreSQL + Mosquitto + NestJS)
docker compose up -d

# Kiểm tra logs
docker compose logs -f nestjs_app
```

**Hoặc chạy NestJS locally (dev mode):**

```bash
cd backend-fire-detection
npm install
npm run start:dev
```

---

### 2. AI Worker (Python)

```bash
cd ai_worker

# 1. Tạo virtual environment
python -m venv venv
source venv/bin/activate   # Linux/macOS
# venv\Scripts\activate    # Windows

# 2. Cài đặt dependencies
pip install opencv-python ultralytics paho-mqtt

# 3. Chạy AI Worker cho một camera
python main.py \
  --source "http://192.168.1.100/mjpeg/1" \   # URL stream (hoặc 0 cho webcam)
  --camera_id 1 \                              # ID camera trong DB
  --camera_name "Phòng Khách" \               # Tên camera hiển thị
  --yolo_conf 0.5                              # Ngưỡng confidence YOLO (0.0-1.0)
```

> **Lưu ý:** Backend tự động khởi động/tắt AI Worker process khi người dùng bật/tắt camera trong giao diện web (thông qua biến `AI_WORKER_DIR` và `PYTHON_VENV_DIR` trong .env).

---

### 3. Frontend (React)

```bash
cd frontend-fire-detection

# 1. Tạo file môi trường từ mẫu
cp .env.example .env
# → Điền thông tin Firebase project và URL backend

# 2. Cài đặt dependencies
npm install

# 3. Chạy dev server
npm run dev

# Build production
npm run build
```

---

### 4. Firmware Arduino (PlatformIO)

```bash
# Mở thư mục project trong PlatformIO (VS Code extension hoặc CLI)

# ESP32-CAM
cd arduino/ESP32_CAM_fire_01
pio run --target upload

# ESP32 NoCam
cd arduino/ESP32_fire_02
pio run --target upload
```

**Quy trình cấu hình thiết bị sau khi flash:**
1. Thiết bị khởi động, tạo WiFi AP: `ESP32-CAM-FireAlarm` hoặc `ESP32-FireAlarm-2`
2. Kết nối điện thoại/máy tính vào AP này (không cần mật khẩu)
3. Trình duyệt tự mở captive portal (hoặc vào `192.168.4.1`)
4. Nhập **SSID + mật khẩu WiFi** và **IP/Domain của MQTT Server**
5. Thiết bị tự kết nối và đăng ký với backend

---

## Biến Môi Trường

### Backend (`backend-fire-detection/.env`)

```env
# PostgreSQL
DB_PASS=your_secure_password

# Server
PORT=3000
NODE_ENV=development

# CORS - URL của frontend (có thể nhiều, cách nhau bằng dấu phẩy)
FRONTEND_URL=http://localhost:5173

# MQTT Broker
MQTT_HOST=localhost
MQTT_PORT=1883
MQTT_BROKER_URL=mqtt://localhost:1883

# JWT
JWT_SECRET=your_super_secret_jwt_key_here

# AI Worker - đường dẫn tuyệt đối tới thư mục ai_worker
AI_WORKER_DIR=/path/to/fire-detection/ai_worker
PYTHON_VENV_DIR=/path/to/fire-detection/ai_worker/venv

# Firebase Admin SDK
FIREBASE_CREDENTIALS_PATH=/path/to/serviceAccountKey.json

# Debug AI Worker process (true/false)
AI_WORKER_DEBUG=false
```

### Frontend (`frontend-fire-detection/.env`)

```env
# Firebase Web Config (lấy từ Firebase Console → Project Settings → Your apps)
VITE_FIREBASE_API_KEY=YOUR_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT_ID.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR_PROJECT_ID.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_APP_ID

# FCM VAPID Key (Firebase Console → Cloud Messaging → Web Push certificates)
VITE_FIREBASE_VAPID_KEY=YOUR_VAPID_KEY

# URL của backend NestJS
VITE_BACKEND_URL=http://localhost:3000
```

---

## MQTT Topics

### Topics AI Worker → Backend

| Topic | Payload | Mô tả |
|---|---|---|
| `video/{camera_id}` | `<base64 JPEG string>` | Frame video stream (320×240, JPEG) |
| `alerts/ai_detected` | `{"camera_id": 1, "temp_video": "AI_temp_xxx.webm", "timestamp": "..."}` | Phát hiện lửa từ YOLO |
| `alerts/video_ready` | `{"alert_id": 5, "camera_id": 1, "video_filename": "fire_xxx.webm"}` | Video đã ghi xong, sẵn sàng cập nhật DB |
| `alerts/image_ready` | `{"alert_id": 5, "camera_id": 1, "image_filename": "fire_xxx.jpg"}` | Ảnh đã di chuyển vào saved_images |

### Topics ESP32 → Backend

| Topic | Payload | Mô tả |
|---|---|---|
| `sensors/{MAC}` | `{"temperature": 25.0, "humidity": 60.0, "gasPercent": 5}` | Dữ liệu cảm biến (NoCam) |
| `sensors/{MAC}` | `{"smoke": 0, "flame": 1}` | Dữ liệu cảm biến (CAM) |
| `status/{MAC}` | `"online"` hoặc `"offline"` | Trạng thái kết nối (LWT) |
| `discovery/cameras` | `{"mac": "...", "ip": "...", "streamUrl": "...", "type": "...", "sensors": [...]}` | Beacon tự đăng ký mỗi 60s |

### Topics Backend → AI Worker

| Topic | Payload | Mô tả |
|---|---|---|
| `commands/capture_alert_media/{camera_id}` | `{"alert_id": 5, "temp_video": "AI_temp_xxx.webm", "alert_time": "20260916_103000"}` | Lệnh di chuyển media từ temp sang saved |

### Topics Backend → ESP32

| Topic | Payload | Mô tả |
|---|---|---|
| `commands/{MAC}` | `{"buzzer": 1}` | Bật còi báo động |
| `commands/{MAC}` | `{"buzzer": 0}` | Tắt còi báo động |

---

## Luồng Hoạt Động

### Luồng Phát Hiện Cháy (AI + Sensor Combined)

```
1. ESP32 gửi dữ liệu cảm biến → MQTT topic sensors/{MAC}
2. AI Worker chạy YOLO mỗi 5 frame → phát hiện lửa
3. AI Worker gửi MQTT alerts/ai_detected
4. Backend nhận cả 2 nguồn → evaluateAndPublishAlarmState()
5. Nếu TẤT CẢ cảm biến bật đều triggered:
   a. Gửi MQTT commands/{MAC} → {"buzzer": 1} → ESP32 kích hoạt còi
   b. Tạo Alert record trong PostgreSQL (rỗng, chưa có media)
   c. Broadcast Socket.IO event "FIRE_ALARM" → Frontend hiển thị toast
   d. Gửi FCM push notification → điện thoại người dùng
   e. Gửi MQTT commands/capture_alert_media/{camera_id} → AI Worker
6. AI Worker nhận lệnh:
   a. Ngay lập tức: Di chuyển ảnh temp → saved_images, gửi alerts/image_ready
   b. Sau 30s: Hoàn tất video buffer, di chuyển → saved_videos, gửi alerts/video_ready
7. Backend nhận alerts/image_ready và alerts/video_ready:
   → Cập nhật Alert record với tên file ảnh/video
   → Broadcast Socket.IO "ALERTS_REFRESH" → Frontend tải lại media
```

### Luồng Auto-Discovery Thiết Bị

```
1. ESP32 khởi động, kết nối WiFi và MQTT
2. Mỗi 60 giây: Gửi MQTT discovery/cameras với thông tin MAC, IP, streamUrl, sensors
3. Backend nhận → camerasService.handleDiscovery()
4. Nếu camera chưa tồn tại: Tạo mới với owner là admin
5. Nếu đã tồn tại: Cập nhật IP, streamUrl
6. Frontend tự động nhận camera mới qua Socket.IO/API refresh
```

---

## API Endpoints

### Authentication
| Method | Endpoint | Mô tả |
|---|---|---|
| `POST` | `/auth/register` | Đăng ký tài khoản |
| `POST` | `/auth/login` | Đăng nhập (trả về JWT cookie) |
| `POST` | `/auth/logout` | Đăng xuất |

### Users
| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/users` | Lấy thông tin user hiện tại |
| `PATCH` | `/users` | Cập nhật thông tin cá nhân |
| `POST` | `/users/fcm-token` | Đăng ký FCM token thiết bị |
| `DELETE` | `/users/fcm-token` | Xóa FCM token (đăng xuất) |

### Rooms
| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/rooms` | Lấy danh sách phòng |
| `POST` | `/rooms` | Tạo phòng mới |
| `PATCH` | `/rooms/:id` | Cập nhật thông tin phòng |
| `DELETE` | `/rooms/:id` | Xóa phòng |

### Cameras
| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/cameras` | Lấy danh sách camera |
| `GET` | `/cameras/:id` | Lấy thông tin chi tiết camera |
| `POST` | `/cameras` | Thêm camera mới |
| `PATCH` | `/cameras/:id` | Cập nhật cấu hình camera |
| `DELETE` | `/cameras/:id` | Xóa camera |
| `POST` | `/cameras/:id/toggle-ai` | Bật/tắt AI Worker cho camera |

### Alerts
| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/alerts` | Lấy lịch sử cảnh báo (có phân trang, lọc) |
| `GET` | `/alerts/:id` | Lấy chi tiết 1 cảnh báo |
| `DELETE` | `/alerts/:id` | Xóa cảnh báo |

### Static Files (Served by NestJS)
| Path | Mô tả |
|---|---|
| `GET /images/{filename}` | Ảnh chụp sự kiện từ `ai_worker/saved_images/` |
| `GET /videos/{filename}` | Video sự kiện từ `ai_worker/saved_videos/` |

---

## ⚙️ Cấu Hình & Tuning

### AI Worker (`ai_worker/config.py`)

```python
YOLO_MODEL_PATH      = "best.pt"    # Đường dẫn model YOLO
YOLO_INFERENCE_EVERY = 5            # Chạy YOLO mỗi N frame (tăng để tiết kiệm CPU)

MQTT_BROKER          = "localhost"  # Địa chỉ MQTT Broker
MQTT_PORT            = 1883

PROXY_WIDTH          = 320          # Độ rộng frame gửi về backend (px)
PROXY_HEIGHT         = 240          # Chiều cao frame gửi về backend (px)
PROXY_JPEG_QUALITY   = 50          # Chất lượng JPEG (0-100)

ALERT_COOLDOWN       = 30           # Giây giữa 2 lần gửi alert liên tiếp
FPS_ESTIMATE         = 10           # FPS target của AI Worker
PRE_RECORD_SECONDS   = 30           # Giây buffer trước sự kiện
POST_RECORD_SECONDS  = 30           # Giây ghi thêm sau sự kiện
```

### Backend (`src/mqtt/mqtt.service.ts`)

```typescript
const AI_ACTIVE_WINDOW_MS = 15_000;  // Cửa sổ thời gian AI được coi là "active" (ms)
const ALERT_COOLDOWN_MS   = 60_000;  // Cooldown giữa 2 alert trong DB (ms)
```

### Cấu hình Camera (qua Frontend)

Mỗi camera có thể cấu hình độc lập:
- **YOLO Confidence** (0.0 - 1.0): Ngưỡng tin cậy AI. Đặt 0 để tắt AI
- **Nhiệt độ tối đa (°C)**: Ngưỡng báo động nhiệt độ. Đặt 0 để tắt
- **Nồng độ Gas tối đa (%)**: Ngưỡng báo động gas. Đặt 0 để tắt
- **Cảm biến khói** (bật/tắt)
- **Cảm biến lửa** (bật/tắt)

---

## Database Schema

```sql
-- Người dùng
users: id, email, passwordHash, fcmTokens[], createdAt

-- Phòng
rooms: id, name, ownerId (→ users)

-- Camera
cameras: id, name, macAddress, streamUrl, type, status,
         roomId (→ rooms), ownerId (→ users),
         yoloConfidence, maxTemperature, maxGasPercent,
         smokeTrigger, flameTrigger, aiWorkerPid

-- Cảnh báo
fire_alerts: id, cameraId (→ cameras), imageFilename,
             videoFilename, detectedAt, level
```

---

## Bảo Mật

- **JWT** lưu trong **HttpOnly cookie** - tránh XSS đánh cắp token
- **bcrypt** hash mật khẩu với salt rounds mặc định
- **CORS** chỉ cho phép origin từ `FRONTEND_URL` trong `.env`
- **ClassSerializerInterceptor** ẩn field `password` khỏi mọi response
- **ValidationPipe** validate toàn bộ DTO đầu vào tự động

---