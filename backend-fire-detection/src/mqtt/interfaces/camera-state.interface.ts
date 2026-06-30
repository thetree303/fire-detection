/**
 * State quản lý trạng thái tạm thời cho các camera
 */

import { SensorDataDto } from '../dto/sensor-data.dto';

export interface CameraState {
  // Dữ liệu cảm biến mới nhất nhận được từ MQTT
  latestSensorData?: SensorDataDto;
  // Trạng thái kích hoạt của AI
  aiTriggered: boolean;
  // Thời gian kích hoạt cuối cùng của AI (timestamp ms)
  lastAiActive: number;
  // Tên file ảnh cuối cùng từ AI
  lastImageFilename?: string;
  // Tên file video cuối cùng từ AI
  lastVideoFilename?: string;
  // Tên file video tạm hiện tại từ AI
  tempVideoFilename?: string;
  // Thời gian cảnh báo cuối cùng (ms) – dùng cho cooldown 1 phút
  lastAlertTime?: number;
  // ID của timeout (dự phòng, có thể dùng sau)
  timeoutId?: NodeJS.Timeout;
  // Thời gian nhận trạng thái buzzer cuối cùng
  lastBuzzerState?: number;
}
