"""
    AI Worker Configuration
    Chứa các tham số cấu hình cho AI Worker
    ═══════════════════════════════════════════
    ĐỂ TUỲ CHỈNH: Chỉnh sửa các hằng số bên dưới,
    mọi tham số đều được tập trung tại file này.
"""

# ─────────────────────────────────────────────────────────────────
# CẤU HÌNH CAMERA & YOLO
# ─────────────────────────────────────────────────────────────────
YOLO_MODEL_PATH      = "best.pt"
YOLO_INFERENCE_EVERY = 5           # Chạy YOLO mỗi N frame (tăng để tiết kiệm CPU)

# ─────────────────────────────────────────────────────────────────
# CẤU HÌNH MQTT
# ─────────────────────────────────────────────────────────────────
MQTT_BROKER        = "localhost"
MQTT_PORT          = 1883
MQTT_KEEPALIVE     = 60

# Topic AI Worker GỬI LÊN Backend
MQTT_TOPIC_ALERT         = "alerts/ai_detected"        # Thay thế "alerts/fire_detected"
MQTT_TOPIC_VIDEO_READY   = "alerts/video_ready"
MQTT_TOPIC_IMAGE_READY   = "alerts/image_ready"

# Topic AI Worker NHẬN TỪ Backend
# (Dùng format: commands/keep_media/{CAMERA_ID} — được subscribe động trong main.py)
MQTT_TOPIC_KEEP_MEDIA_PREFIX = "commands/keep_media"
MQTT_TOPIC_CAPTURE_ALERT_MEDIA_PREFIX = "commands/capture_alert_media"

# ─────────────────────────────────────────────────────────────────
# CẤU HÌNH PROXY VIDEO STREAM (Ảnh nhỏ gửi về server)
# ─────────────────────────────────────────────────────────────────
PROXY_WIDTH        = 320
PROXY_HEIGHT       = 240
PROXY_JPEG_QUALITY = 50

# ─────────────────────────────────────────────────────────────────
# CẤU HÌNH THƯ MỤC LƯU TRỮ
# ─────────────────────────────────────────────────────────────────
# Thư mục CHÍNH — lưu file đã được Backend xác nhận là báo thật
SAVED_IMAGES_DIR   = "saved_images"
SAVED_VIDEOS_DIR   = "saved_videos"

# Thư mục TẠM (Quarantine) — lưu file chưa được xác nhận
# AI luôn ghi vào đây trước; nếu Backend không gửi lệnh keep thì tự động dọn
TEMP_IMAGES_DIR    = "saved_images/temp"
TEMP_VIDEOS_DIR    = "saved_videos/temp"


# ─────────────────────────────────────────────────────────────────
# CẤU HÌNH CẢNH BÁO & GHI HÌNH
# ─────────────────────────────────────────────────────────────────
ALERT_COOLDOWN     = 30            # Giây giữa 2 lần gửi alert liên tiếp

STREAM_TIMEOUT     = 5
RECONNECT_DELAY    = 3

VIDEO_QUEUE_MAX    = 10
FPS_ESTIMATE       = 10
PRE_RECORD_SECONDS = 30
POST_RECORD_SECONDS = 30
BUFFER_MAX_LEN = (PRE_RECORD_SECONDS + POST_RECORD_SECONDS) * FPS_ESTIMATE