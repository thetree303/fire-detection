"""
main.py
══════════════════════════════════════════════════════════════════
Entry point của AI Worker.

Thay đổi so với phiên bản cũ:
  - Video được ghi vào TEMP_VIDEOS_DIR thay vì SAVED_VIDEOS_DIR.
  - MQTT_TOPIC_ALERT thay thế chuỗi cũ.
"""

import argparse
import time
import signal
import base64
import logging
import sys
import cv2
from collections import deque
from ultralytics import YOLO
from datetime import datetime

from config import (
    YOLO_MODEL_PATH,
    YOLO_INFERENCE_EVERY,
    MQTT_BROKER,
    MQTT_PORT,
    MQTT_KEEPALIVE,
    PROXY_WIDTH,
    PROXY_HEIGHT,
    PROXY_JPEG_QUALITY,
    TEMP_VIDEOS_DIR,
    SAVED_VIDEOS_DIR,
    FPS_ESTIMATE,
    POST_RECORD_SECONDS,
    BUFFER_MAX_LEN,
    MQTT_TOPIC_VIDEO_READY,
)
from mqtt_manager import MQTTManager
from video_stream import VideoStreamReader, StreamOfflineException
from alert_manager import AlertManager

logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format="[%(levelname)s] %(message)s",
)
log = logging.getLogger("ai_worker")


def encode_frame_to_base64(frame) -> str:
    resized = cv2.resize(frame, (PROXY_WIDTH, PROXY_HEIGHT), interpolation=cv2.INTER_LINEAR)
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, PROXY_JPEG_QUALITY]
    success, buffer = cv2.imencode(".jpg", resized, encode_params)
    if not success:
        return ""
    b64_bytes = base64.b64encode(buffer)
    return b64_bytes.decode("utf-8")


def get_args():
    parser = argparse.ArgumentParser(description="AI Fire Detection Worker")
    parser.add_argument("--source",      type=str,   default="0",   help="Camera source: 0 cho webcam, hoặc rtsp/http url")
    parser.add_argument("--camera_id",   type=str,   required=True, help="ID duy nhất của camera/thiết bị")
    parser.add_argument("--camera_name", type=str,   required=True, help="Tên của camera/thiết bị")
    parser.add_argument("--yolo_conf",   type=float, default=0.5,   help="Ngưỡng confidence cho YOLO")
    parser.add_argument("--show_debug",  type=bool,  default=False, help="Hiển thị cửa sổ debug")
    return parser.parse_args()


def main():
    args = get_args()

    def sigterm_handler(signum, frame):
        log.warning("Received SIGTERM from backend. Shutting down...")
        raise KeyboardInterrupt
    
    signal.signal(signal.SIGTERM, sigterm_handler)

    CAMERA_ID       = args.camera_id
    CAMERA_NAME     = args.camera_name
    STREAM_URL      = int(args.source) if args.source.isdigit() else args.source
    YOLO_CONFIDENCE = args.yolo_conf
    SHOW_DEBUG      = args.show_debug

    MQTT_TOPIC_VIDEO = f"video/{CAMERA_ID}"

    model = YOLO(YOLO_MODEL_PATH)
    log.info("YOLO model ready.")

    # ── Khởi động MQTT ───────────────────────────────────────────────
    mqtt_mgr = MQTTManager(MQTT_BROKER, MQTT_TOPIC_VIDEO, MQTT_PORT, MQTT_KEEPALIVE)
    mqtt_mgr.start()

    # ── Khởi động VideoStream & AlertManager ─────────────────────────
    stream    = VideoStreamReader(STREAM_URL)
    alert_mgr = AlertManager(mqtt_mgr, CAMERA_ID)

    frame_index       = 0
    display_frame     = None

    # Bộ đệm xoay vòng lưu frame trước/sau sự kiện
    frame_buffer      = deque(maxlen=BUFFER_MAX_LEN)

    # Chuẩn hóa FPS
    last_frame_time = 0.0
    frame_interval = 1.0 / FPS_ESTIMATE

    try:
        while True:
            ok, raw_frame = stream.read_frame()
            if not ok:
                continue

            # Ép về đúng FPS như cấu hình
            now = time.time()
            if now - last_frame_time < frame_interval:
                continue 
            
            last_frame_time = now

            frame_index += 1
            annotated_frame = raw_frame
            has_fire = False

            # ── Chạy YOLO mỗi YOLO_INFERENCE_EVERY frame ─────────────
            if frame_index % YOLO_INFERENCE_EVERY == 0:
                results = model(raw_frame, verbose=False)
                annotated_frame = results[0].plot()

                for box in results[0].boxes:
                    conf   = float(box.conf[0])
                    cls_id = int(box.cls[0])
                    if conf >= YOLO_CONFIDENCE and cls_id == 0:
                        has_fire = True
                        break

                display_frame = annotated_frame

            frame_to_send = display_frame if display_frame is not None else raw_frame

            # ── Vẽ Timestamp & tên Camera lên frame ──────────────────
            h, w = frame_to_send.shape[:2]
            font_scale   = max(0.4, w / 800.0)
            thickness    = max(1, int(font_scale * 1.5))
            bg_thickness = thickness + 2
            x_pad   = int(w * 0.02)
            y_top   = int(h * 0.05) + int(10 * font_scale)
            y_bottom = int(h * 0.95)

            current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            cv2.putText(frame_to_send, current_time, (x_pad, y_top),
                        cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0, 0, 0), bg_thickness)
            cv2.putText(frame_to_send, current_time, (x_pad, y_top),
                        cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), thickness)
            cv2.putText(frame_to_send, CAMERA_NAME, (x_pad, y_bottom),
                        cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0, 0, 0), bg_thickness)
            cv2.putText(frame_to_send, CAMERA_NAME, (x_pad, y_bottom),
                        cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), thickness)

            frame_buffer.append(frame_to_send)

            # ── Gửi frame lên Backend qua MQTT ───────────────────────
            b64_frame = encode_frame_to_base64(frame_to_send)
            mqtt_mgr.publish(MQTT_TOPIC_VIDEO, b64_frame)

            # ── Cập nhật frame hiện tại để chụp ảnh khi Backend yêu cầu ────
            alert_mgr.latest_frame = frame_to_send

            # ── Logic ghi hình & gửi alert ────────────────────────────
            if has_fire:
                alert_mgr.try_send_temp_video(frame_buffer, w, h)

            # ── Debug window ──────────────────────────────────────────
            if display_frame is not None and SHOW_DEBUG:
                cv2.imshow("AI Fire Detection [debug]", display_frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                log.info("User requested stop via GUI.")
                break

    except StreamOfflineException as e:
        log.error(f"FATAL: {e}. Shutting down AI Worker autonomously.")

    except KeyboardInterrupt:
        log.info("Shutdown signal received (Ctrl+C).")

    finally:
        log.info("Releasing resources...")
        stream.release()
        mqtt_mgr.stop()
        cv2.destroyAllWindows()
        log.info("AI Worker stopped successfully.")


if __name__ == "__main__":
    main()