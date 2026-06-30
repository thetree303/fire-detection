"""
mqtt_manager.py
══════════════════════════════════════════════════════════════════
Quản lý kết nối và publish/subscribe MQTT.

Thay đổi so với phiên bản cũ:
  - Thêm phương thức subscribe() để đăng ký callback nhận lệnh từ Backend.
  - on_message dispatcher hỗ trợ nhiều topic/callback độc lập.
"""

import threading
import time
import logging
import paho.mqtt.client as mqtt
from queue import Queue, Full
from config import (
    RECONNECT_DELAY,
    VIDEO_QUEUE_MAX,
)

log = logging.getLogger("ai_worker.mqtt")


class MQTTManager:
    def __init__(self, broker: str, mqtt_topic: str, port: int, keepalive: int):
        self.broker     = broker
        self.mqtt_topic = mqtt_topic   # Topic video stream (dùng để ưu tiên queue)
        self.port       = port
        self.keepalive  = keepalive
        self._connected = False

        # Map topic → callback để dispatcher on_message gọi đúng handler
        self._subscriptions: dict[str, callable] = {}

        self._queue: Queue = Queue(maxsize=VIDEO_QUEUE_MAX * 2)

        self._client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        self._client.on_connect    = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message    = self._on_message_dispatcher

        self._publish_thread = threading.Thread(
            target=self._publish_worker, daemon=True, name="mqtt-publisher"
        )

    # ─────────────────────────────────────────────────────────────────
    # Lifecycle
    # ─────────────────────────────────────────────────────────────────
    def start(self) -> None:
        self._connect_with_retry()
        self._client.loop_start()
        self._publish_thread.start()

    def _connect_with_retry(self) -> None:
        while True:
            try:
                self._client.connect(self.broker, self.port, self.keepalive)
                return
            except Exception as exc:
                log.error(
                    "MQTT: Connection failed (%s) — retrying in %ds...",
                    exc, RECONNECT_DELAY,
                )
                time.sleep(RECONNECT_DELAY)

    def stop(self) -> None:
        self._client.loop_stop()
        self._client.disconnect()

    # ─────────────────────────────────────────────────────────────────
    # Callbacks kết nối
    # ─────────────────────────────────────────────────────────────────
    def _on_connect(self, client, userdata, flags, reason_code, properties) -> None:
        if reason_code == 0:
            self._connected = True
            log.info("MQTT: Connected to broker.")
            # Re-subscribe sau khi reconnect
            for topic in self._subscriptions:
                self._client.subscribe(topic)
        else:
            log.warning("MQTT: Connection failed, reason_code=%s", reason_code)

    def _on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties) -> None:
        self._connected = False
        log.warning("MQTT: Connection lost (reason_code=%s) — reconnecting...", reason_code)

    # ─────────────────────────────────────────────────────────────────
    # Message dispatcher — điều hướng đến đúng callback
    # ─────────────────────────────────────────────────────────────────
    def _on_message_dispatcher(self, client, userdata, message) -> None:
        """Nhận message MQTT và gọi callback đã đăng ký cho topic tương ứng."""
        topic = message.topic
        callback = self._subscriptions.get(topic)
        if callback:
            try:
                callback(client, userdata, message)
            except Exception as exc:
                log.error("MQTT: Error in callback for topic '%s': %s", topic, exc)
        else:
            log.debug("MQTT: Received message from unregistered topic: %s", topic)

    # ─────────────────────────────────────────────────────────────────
    # Subscribe / Publish API
    # ─────────────────────────────────────────────────────────────────
    def subscribe(self, topic: str, callback: callable, qos: int = 1) -> None:
        """
        Đăng ký lắng nghe một topic với callback tương ứng.
        Tự động re-subscribe sau khi reconnect.

        Args:
            topic:    Topic MQTT cần subscribe.
            callback: Hàm callback(client, userdata, message).
            qos:      Quality of Service (mặc định 1).
        """
        self._subscriptions[topic] = callback
        if self._connected:
            self._client.subscribe(topic, qos=qos)

    def publish(
        self,
        topic: str,
        payload: str | bytes,
        qos: int = 0,
        retain: bool = False,
    ) -> None:
        """Đẩy message vào queue để publish async."""
        try:
            self._queue.put_nowait((topic, payload, qos, retain))
        except Full:
            if topic == self.mqtt_topic:
                # Topic video stream: bỏ frame cũ nhất để nhường chỗ frame mới
                try:
                    self._queue.get_nowait()
                    self._queue.task_done()
                    self._queue.put_nowait((topic, payload, qos, retain))
                except Exception:
                    pass
            else:
                # Topic quan trọng (alert, command): chờ tối đa 2 giây
                try:
                    self._queue.put((topic, payload, qos, retain), timeout=2)
                except Exception:
                    log.warning("MQTT queue full, dropping message: %s", topic)

    # ─────────────────────────────────────────────────────────────────
    # Publish worker thread
    # ─────────────────────────────────────────────────────────────────
    def _publish_worker(self) -> None:
        while True:
            topic, payload, qos, retain = self._queue.get()
            if not self._connected:
                # Bỏ qua frame video khi mất kết nối; giữ các topic quan trọng
                if topic == self.mqtt_topic:
                    self._queue.task_done()
                    continue
            try:
                self._client.publish(topic, payload, qos=qos, retain=retain)
            except Exception as exc:
                log.error("MQTT publish error (%s): %s", topic, exc)
            finally:
                self._queue.task_done()

    # ─────────────────────────────────────────────────────────────────
    # Properties
    # ─────────────────────────────────────────────────────────────────
    @property
    def is_connected(self) -> bool:
        return self._connected