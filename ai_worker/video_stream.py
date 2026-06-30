import cv2
import time
import logging
from config import *

log = logging.getLogger("ai_worker.video_stream")

# Thêm Exception tùy chỉnh để báo hiệu mất kết nối quá lâu
class StreamOfflineException(Exception):
    pass

class VideoStreamReader:
    def __init__(self, url: str, timeout: float = STREAM_TIMEOUT, max_retries: int = 20):
        self.url     = url
        self.timeout = timeout
        self.max_retries = max_retries
        self.retry_count = 0
        self._cap: cv2.VideoCapture | None = None

    def _open(self) -> bool:
        if self._cap:
            self._cap.release()
        cap = cv2.VideoCapture(self.url)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, int(self.timeout * 1000))
        cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, int(self.timeout * 1000))
        
        if cap.isOpened():
            log.info("Stream connected.")
            self._cap = cap
            self.retry_count = 0 # Reset bộ đếm khi kết nối thành công
            return True
            
        log.error("Could not open stream.")
        return False

    def read_frame(self):
        if self._cap is None:
            if not self._open():
                self._increment_retry()
                time.sleep(RECONNECT_DELAY)
                return False, None

        ret, frame = self._cap.read()
        if not ret:
            log.warning("Frame read failed - reconnecting in %ds...", RECONNECT_DELAY)
            self._increment_retry()
            time.sleep(RECONNECT_DELAY)
            self._open()
            return False, None
            
        self.retry_count = 0 # Reset khi đọc frame thành công
        return True, frame

    def _increment_retry(self):
        """Tăng bộ đếm, nếu quá giới hạn thì ném ra Exception"""
        self.retry_count += 1
        if self.retry_count >= self.max_retries:
            log.error(f"Stream offline too long ({self.retry_count} retries). Giving up.")
            raise StreamOfflineException("Camera is dead.")

    def release(self):
        if self._cap:
            self._cap.release()