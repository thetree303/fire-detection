import './RightPanel.css'
import { FaTemperatureHigh } from "react-icons/fa";
import { MdOutlineGasMeter } from "react-icons/md";
import { WiHumidity } from "react-icons/wi";
import CameraAlertsList from './CameraAlertsList';

// ─────────────────────────────────────────────────────────────────
// RightPanel — Cột 3 của dashboard
// Sections: Sensor Details | Recent Alerts | 24h Chart
// ─────────────────────────────────────────────────────────────────
const RightPanel = ({ cameraInfo, sensorData = {}, alertHistory = [], isDanger }) => {
  // Derived sensor values
  const temp = sensorData.temperature;
  const humidity = sensorData.humidity;
  const gasPercent = sensorData.gasPercent;
  const smoke = sensorData.smoke;
  const flame = sensorData.flame;
  const hasSensor = Object.keys(sensorData).length > 0;

  // Giới hạn cảnh báo
  let maxGasPercent, maxTemperature, flameTrigger, smokeTrigger;
  if (cameraInfo) {
    maxGasPercent = cameraInfo.maxGasPercent;
    maxTemperature = cameraInfo.maxTemperature;
    flameTrigger = cameraInfo.flameTrigger;
    smokeTrigger = cameraInfo.smokeTrigger;
  }

  return (
    <div className="right-panel">
      <div className="right-panel-scroll">

        {/* ═══════════════════════════════════
            SECTION 1 — Sensor Details (Realtime)
            ═══════════════════════════════════ */}
        <div className="rp-section">
          <div className="rp-section-header">
            <span className="rp-section-title">
              Cảm biến thời gian thực
            </span>
            {isDanger && (
              <span className="rp-section-badge alert">Nguy hiểm</span>
            )}
          </div>

          {/* THÊM LOGIC KIỂM TRA TRẠNG THÁI Ở ĐÂY */}
          {cameraInfo?.status === 'not_binded' ? (
            <div className="sensor-waiting" style={{ color: '#ef4444' }}>
              <span>Thiết bị chưa được đồng bộ</span>
            </div>
          ) : cameraInfo?.status === 'offline' ? (
            <div className="sensor-waiting" style={{ color: '#ef4444' }}>
              <span>Thiết bị đang ngoại tuyến</span>
            </div>
          ) : !hasSensor ? (
            <div className="sensor-waiting">
              <span className="sensor-waiting-dot" />
              <span>Đang chờ dữ liệu cảm biến...</span>
            </div>
          ) : (
            <>
              <div className="sensor-row">
                {/* Temperature */}
                {temp !== undefined && (
                  <SensorBar
                    icon={<FaTemperatureHigh />}
                    label="Nhiệt độ"
                    value={`${temp}°C` + (maxTemperature ? ` / ${maxTemperature}°C` : '')}
                    percent={Math.min((temp / 100) * 100, 100)}
                    level={(maxTemperature && temp > maxTemperature) ? 'danger' : (maxTemperature && temp > maxTemperature * 0.6) ? 'warning' : 'safe'}
                  />
                )}

                {/* Humidity */}
                {humidity !== undefined && (
                  <SensorBar
                    icon={<WiHumidity />}
                    label="Độ ẩm"
                    value={`${humidity}%`}
                    percent={Math.min(humidity, 100)}
                    level="safe"
                  />
                )}

                {/* Gas */}
                {gasPercent !== undefined && (
                  <SensorBar
                    icon={<MdOutlineGasMeter />}
                    label="Nồng độ khí Gas"
                    value={`${gasPercent}%` + (maxGasPercent ? ` / ${maxGasPercent}%` : '')}
                    percent={gasPercent}
                    level={(maxGasPercent && gasPercent > maxGasPercent) ? 'danger' : (maxGasPercent && gasPercent > maxGasPercent * 0.6) ? 'warning' : 'safe'}
                  />
                )}
              </div>

              {/* Binary sensors */}
              {(smoke !== undefined || flame !== undefined) && (
                <div className="sensor-binary-row" style={{ marginTop: '10px' }}>
                  {smoke !== undefined && (
                    <div className={`sensor-binary-item${(smoke === 1) ? ' triggered' : ''}`}>
                      <span className="sensor-binary-label">Khói</span>
                      <span className={`sensor-binary-status ${(smoke === 1) ? 'danger' : 'safe'}`}>
                        {(smoke === 1) ? 'CÓ KHÓI' : 'AN TOÀN'}
                      </span>
                    </div>
                  )}
                  {flame !== undefined && (
                    <div className={`sensor-binary-item${(flame === 1) ? ' triggered' : ''}`}>
                      <span className="sensor-binary-label">Lửa</span>
                      <span className={`sensor-binary-status ${(flame === 1) ? 'danger' : 'safe'}`}>
                        {(flame === 1) ? 'CÓ LỬA' : 'AN TOÀN'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ═══════════════════════════════════
            SECTION 2 — Recent Alerts
            ═══════════════════════════════════ */}
        <div className="rp-section">
          {cameraInfo ? (
            <CameraAlertsList cameraId={cameraInfo.id} alertHistory={alertHistory} />
          ) : (
            <div className="chart-no-data">Đang tải thông tin camera...</div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// SensorBar — thanh progress nằm ngang
// ─────────────────────────────────────────────
const SensorBar = ({ label, value, icon, percent, level }) => (
  <div className="sensor-bar-item">
    <div className="sensor-bar-header">
      <span className="sensor-bar-label">
        <span>{icon}</span>
        {label}
      </span>
      <span className={`sensor-bar-value ${level}`}>{value}</span>
    </div>
    <div className="sensor-bar-track">
      <div
        className={`sensor-bar-fill ${level}`}
        style={{ width: `${Math.min(Math.max(percent, 2), 100)}%` }}
      />
    </div>
  </div>
);

export default RightPanel;
