"""
alert_manager.py
══════════════════════════════════════════════════════════════════
Quản lý việc ghi ảnh/video và gửi cảnh báo MQTT.
Tối ưu hóa: Báo động lập tức (0 delay) và lưu video đủ 30s trước + 30s sau.
"""

import cv2
import json
import time
import os
import threading
import shutil
import logging
from datetime import datetime
from mqtt_manager import MQTTManager
from config import (
    ALERT_COOLDOWN,
    SAVED_IMAGES_DIR,
    SAVED_VIDEOS_DIR,
    TEMP_IMAGES_DIR,
    TEMP_VIDEOS_DIR,
    MQTT_TOPIC_ALERT,
    MQTT_TOPIC_VIDEO_READY,
    MQTT_TOPIC_IMAGE_READY,
    MQTT_TOPIC_CAPTURE_ALERT_MEDIA_PREFIX,
    POST_RECORD_SECONDS,
    PRE_RECORD_SECONDS,
    FPS_ESTIMATE
)

log = logging.getLogger("ai_worker.alert")

class AlertManager:
    def __init__(self, mqtt: MQTTManager, camera_id: str, cooldown: float = ALERT_COOLDOWN):
        self._mqtt      = mqtt
        self._camera_id = camera_id
        self._cooldown  = cooldown
        self._last_sent = 0.0
        self.latest_frame = None

        # Hàng đợi lưu trữ các lệnh từ Backend được gửi tới trong lúc chờ ghi 30s video tương lai
        self.pending_commands = {}

        # Đảm bảo thư mục tồn tại
        os.makedirs(TEMP_IMAGES_DIR, exist_ok=True)
        os.makedirs(TEMP_VIDEOS_DIR, exist_ok=True)
        os.makedirs(SAVED_IMAGES_DIR, exist_ok=True)
        os.makedirs(SAVED_VIDEOS_DIR, exist_ok=True)

        # Subscribe topic nhận lệnh từ Backend
        self._capture_topic = f"{MQTT_TOPIC_CAPTURE_ALERT_MEDIA_PREFIX}/{camera_id}"
        self._mqtt.subscribe(self._capture_topic, self._on_capture_alert_media_command)

    def _on_capture_alert_media_command(self, client, userdata, message) -> None:
        try:
            payload = json.loads(message.payload.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            log.error("[CAPTURE-MEDIA] Invalid payload: %s", exc)
            return

        alert_id = payload.get("alert_id")
        temp_video = payload.get("temp_video")
        alert_time = payload.get("alert_time")
        
        if not temp_video or not alert_time:
            log.error("[CAPTURE-MEDIA] Missing temp_video or alert_time")
            return

        # === Di chuyển ảnh tại T = 0 sang folder chính ngay lập tức === 
        img_filename = f"fire_{alert_time}.jpg"
        temp_img_filename = temp_video.replace(".webm", ".jpg")
        src_img_path = os.path.join(TEMP_IMAGES_DIR, temp_img_filename)
        dst_img_path = os.path.join(SAVED_IMAGES_DIR, img_filename)

        if os.path.isfile(src_img_path):
            try:
                shutil.move(src_img_path, dst_img_path)
            except Exception as exc:
                log.error("[CAPTURE-MEDIA] Failed to move image: %s", exc)
        elif self.latest_frame is not None:
            # Fallback nếu ảnh temp bị lỗi
            cv2.imwrite(dst_img_path, self.latest_frame)

        # === Gửi MQTT báo ảnh ready ngay lập tức === 
        ready_payload = json.dumps({
            "alert_id": alert_id,
            "camera_id": int(self._camera_id),
            "image_filename": img_filename,
        }, ensure_ascii=False)

        self._mqtt.publish(MQTT_TOPIC_IMAGE_READY, ready_payload, qos=1)

        # Xử lý video
        if not temp_video:
            return

        src_path = os.path.join(TEMP_VIDEOS_DIR, temp_video)
        
        # Nếu video chưa ghi xong (đang trong thời gian 30s post-record chờ lấy tương lai) -> đưa vào hàng chờ
        if not os.path.isfile(src_path):
            self.pending_commands[temp_video] = payload
            return

        # Nếu video đã có sẵn, thực thi xử lý ngay lập tức
        self._process_media_command(payload)

    def _process_media_command(self, payload):
        alert_id = payload.get("alert_id")
        temp_video = payload.get("temp_video")
        alert_time = payload.get("alert_time")

        # 1. Di chuyển và đổi tên video
        vid_filename = f"fire_{alert_time}.webm"
        src_vid_path = os.path.join(TEMP_VIDEOS_DIR, temp_video)
        dst_vid_path = os.path.join(SAVED_VIDEOS_DIR, vid_filename)

        video_moved = False
        try:
            shutil.move(src_vid_path, dst_vid_path)
            video_moved = True
        except OSError as exc:
            log.error("[CAPTURE-MEDIA] Failed to move video %s: %s", temp_video, exc)

        # 2. Publish alerts/media_ready cho Backend cập nhật Database
        ready_payload = json.dumps({
            "alert_id": alert_id,
            "camera_id": int(self._camera_id),
            "video_filename": vid_filename if video_moved else "",
        }, ensure_ascii=False)

        self._mqtt.publish(MQTT_TOPIC_VIDEO_READY, ready_payload, qos=1)

    def try_send_temp_video(self, frame_buffer, w, h) -> bool:
        now = time.time()
        if now - self._last_sent < self._cooldown:
            return False

        self._last_sent = now
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        temp_video_filename = f"AI_temp_{timestamp}.webm"
        video_path = os.path.join(TEMP_VIDEOS_DIR, temp_video_filename)
        
        # 1. LƯU ẢNH TĨNH VÀO TEMP (Để Backend dùng làm bước xác nhận)
        # Sử dụng format tên file giống với temp_video để Backend dễ quản lý
        temp_img_filename = f"AI_temp_{timestamp}.jpg" 
        temp_img_path = os.path.join(TEMP_IMAGES_DIR, temp_img_filename)
        
        if self.latest_frame is not None:
            cv2.imwrite(temp_img_path, self.latest_frame)

        # 2. GỬI MQTT CẢNH BÁO LẬP TỨC
        # Lưu ý: Backend cần payload có 'temp_video' để biết file nào cần capture
        payload = json.dumps({
            "camera_id": int(self._camera_id),
            "temp_video": temp_video_filename,
            "timestamp": datetime.now().isoformat()
        }, ensure_ascii=False)
        self._mqtt.publish(MQTT_TOPIC_ALERT, payload, qos=1)

        # 3. KHỞI CHẠY THREAD NGẦM CHỜ 30S RỒI MỚI GHI VIDEO
        def _delayed_video_worker():
            try:
                # Tạm dừng 30s. Trong lúc này luồng chính vẫn nạp frame tương lai vào frame_buffer
                time.sleep(POST_RECORD_SECONDS)
                
                # Sau khi ngủ 30s, lấy buffer (lúc này đã chứa trọn 60s)
                frames = list(frame_buffer)
                max_frames = (PRE_RECORD_SECONDS + POST_RECORD_SECONDS) * FPS_ESTIMATE
                frames_to_write = frames[-max_frames:] if len(frames) > max_frames else frames
                
                if not frames_to_write:
                    return

                fourcc = cv2.VideoWriter_fourcc(*'vp08')
                out = cv2.VideoWriter(video_path, fourcc, FPS_ESTIMATE, (w, h))
                for f in frames_to_write:
                    out.write(f)
                out.release()
                
                # 4. KIỂM TRA HÀNG ĐỢI LỆNH (Nếu Backend gửi lệnh lưu trong lúc ta đang sleep 30s)
                if temp_video_filename in self.pending_commands:
                    self._process_media_command(self.pending_commands.pop(temp_video_filename))

            except Exception as exc:
                log.error("[ALERT] Background delayed video thread failed: %s", exc)

        write_thread = threading.Thread(target=_delayed_video_worker, daemon=True)
        write_thread.start()

        return True