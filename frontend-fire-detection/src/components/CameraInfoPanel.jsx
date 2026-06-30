import React from 'react';

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * SensorCard - Hiển thị 1 cảm biến với trạng thái BẬT/TẮT
 * Props:
 *   icon: emoji/string
 *   label: tên cảm biến
 *   enabled: boolean
 *   valueText: mô tả ngưỡng khi bật (vd "Báo khi >= 60°C")
 */
const SensorCard = ({ label, enabled, valueText }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 14px',
    borderRadius: '10px',
    background: enabled
      ? 'var(--green-dim)'
      : 'rgba(255,255,255,0.03)',
    transition: 'all 0.2s',
  }}>
    {/* Label + value */}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        fontSize: '14px',
        fontWeight: 700,
        color: 'var(--text-primary)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {label}
      </div>
      {enabled ? (
        <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', marginTop: '1px' }}>
          {valueText}
        </div>
      ) : (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '1px' }}>
          Tắt
        </div>
      )}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────
// InfoRow - 1 dòng thông tin label : value
// ─────────────────────────────────────────────────────────────────
const InfoRow = ({ label, children }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 0',
    borderBottom: '1px solid var(--border, rgba(255,255,255,0.06))',
  }}>
    <span style={{
      width: '110px',
      flexShrink: 0,
      fontSize: '12px',
      color: 'var(--text-muted)',
      fontWeight: 500,
      textTransform: 'uppercase',
      letterSpacing: '0.4px',
    }}>
      {label}
    </span>
    <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
      {children}
    </span>
  </div>
);

// ─────────────────────────────────────────────────────────────────
// CameraInfoPanel - Panel chính, đặt bên dưới video stream
// Props: camera (Camera entity object from API)
// ─────────────────────────────────────────────────────────────────
const CameraInfoPanel = ({ camera }) => {
  if (!camera) return null;

  // Xác định trạng thái BẬT/TẮT từng cảm biến
  // Những sensor nào giá trị NULL thì hệ thống không hỗ trợ, bỏ qua
  const aiEnabled = (camera.yoloConfidence !== null) ? (camera.yoloConfidence ?? 0) > 0 : false;
  const tempEnabled = (camera.maxTemperature !== null) ? (camera.maxTemperature ?? 0) > 0 : false;
  const gasEnabled = (camera.maxGasPercent !== null) ? (camera.maxGasPercent ?? 0) > 0 : false;
  const smokeEnabled = (camera.smokeTrigger !== null) ? (camera.smokeTrigger === true) : false;
  const flameEnabled = (camera.flameTrigger !== null) ? (camera.flameTrigger === true) : false;

  const enabledCount = [aiEnabled, tempEnabled, gasEnabled, smokeEnabled, flameEnabled]
    .filter(Boolean).length;

  return (
    <div style={{
      marginTop: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
    }}>

      {/* ── KHỐI 1: THÔNG TIN CHUNG ── */}
      <div style={{
        background: 'var(--bg-card, rgba(255,255,255,0.04))',
        border: '1px solid var(--border, rgba(255,255,255,0.08))',
        borderRadius: '14px',
        padding: '16px 20px',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
          flexWrap: 'wrap',
          gap: '8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '0.3px',
            }}>
              Thông tin Camera
            </span>
          </div>
        </div>

        {/* Info rows */}
        <div>
          <InfoRow label="Tên Camera">
            <strong>{camera.name || '-'}</strong>
          </InfoRow>
          <InfoRow label="Phòng">
            {camera.room?.name || <span style={{ color: 'var(--text-muted)' }}>Chưa gán phòng</span>}
          </InfoRow>
          <InfoRow label="Mô tả">
            {camera.description || <span style={{ color: 'var(--text-muted)' }}>Không có mô tả</span>}
          </InfoRow>
          <InfoRow label="Địa chỉ MAC">
            <code>
              {camera.macAddress || '-'}
            </code>
          </InfoRow>
          <InfoRow label="Địa chỉ IP">
            {camera.ipAddress || <span style={{ color: 'var(--text-muted)' }}>-</span>}
          </InfoRow>
        </div>
      </div>

      {/* ── KHỐI 2: CẤU HÌNH CẢM BIẾN (AND LOGIC) ── */}
      <div style={{
        background: 'var(--bg-card, rgba(255,255,255,0.04))',
        border: '1px solid var(--border, rgba(255,255,255,0.08))',
        borderRadius: '14px',
        padding: '16px 20px',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '14px',
          flexWrap: 'wrap',
          gap: '8px',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '0.3px',
            }}>
              Cấu hình báo động
            </div>
            <div style={{
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              letterSpacing: '0.3px',
            }}>
              Cảnh báo được phát khi và chỉ khi tất cả các cảm biến đang hoạt động vượt ngưỡng cảnh báo.
            </div>
          </div>
          {camera.status !== 'not_binded' && (
            <span style={{
              fontSize: '13px',
              fontWeight: 600,
              padding: '3px 9px',
              borderRadius: '999px',
              background: enabledCount > 0 ? 'var(--green)' : 'var(--text-muted)',
              color: enabledCount > 0 ? 'white' : 'white',
            }}>
              {enabledCount > 0 ? `${enabledCount} cảm biến BẬT` : 'Tất cả TẮT'}
            </span>
          )}
        </div>

        {(camera.status === 'not_binded') ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100px',
            color: 'var(--text-muted)',
            fontSize: '14px',
          }}>
            Camera chưa được đồng bộ.
          </div>) : (
          <div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill)',
              gap: '8px',
            }}>
              {camera.yoloConfidence !== null && (
                <SensorCard
                  label="Camera AI"
                  enabled={aiEnabled}
                  valueText={`Ngưỡng tin cậy: ${camera.yoloConfidence}`}
                />
              )}
              {camera.maxTemperature !== null && (
                <SensorCard
                  label="Nhiệt độ"
                  enabled={tempEnabled}
                  valueText={tempEnabled ? `Báo khi ≥ ${camera.maxTemperature}°C` : null}
                />
              )}
              {camera.maxGasPercent !== null && (
                <SensorCard
                  label="Khí Gas"
                  enabled={gasEnabled}
                  valueText={gasEnabled ? `Báo khi ≥ ${camera.maxGasPercent}%` : null}
                />
              )}
              {camera.smokeTrigger !== null && (
                <SensorCard
                  label="Cảm biến Khói"
                  enabled={smokeEnabled}
                  valueText={smokeEnabled ? 'Phát hiện có khói' : null}
                />
              )}
              {camera.flameTrigger !== null && (
                <SensorCard
                  label="Cảm biến Lửa"
                  enabled={flameEnabled}
                  valueText={flameEnabled ? 'Phát hiện có lửa' : null}
                />
              )}
            </div>

            {enabledCount === 0 && (
              <div style={{
                marginTop: '12px',
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'var(--red)',
                fontSize: '12px',
                color: 'white',
                fontWeight: 600,
              }}>
                Tất cả cảm biến đang TẮT - hệ thống sẽ không phát cảnh báo. Vào{' '}
                <strong>Quản lý Camera</strong> để bật cảm biến.
              </div>
            )}
          </div>
        )}
      </div>

    </div >
  );
};

export default CameraInfoPanel;
