import { useEffect, useRef, useState, useCallback, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import api, { BACKEND_URL } from '../utils/axios';
import './css/OverviewDashboard.css';
import { FaFire, FaTemperatureHigh } from "react-icons/fa";
import { MdOutlineGasMeter } from "react-icons/md";
import { WiSmoke } from "react-icons/wi";

// ─────────────────────────────────────────────
// Số ô trong lưới
// ─────────────────────────────────────────────
const GRID_SIZE = 4;
const LS_KEY = 'overview_grid_layout'; // localStorage key

// ─────────────────────────────────────────────
// Helper: đọc / ghi localStorage
// ─────────────────────────────────────────────
function loadLayout() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === GRID_SIZE) return parsed;
    }
  } catch { /* ignore */ }
  return Array(GRID_SIZE).fill(null); // [null, null, null, null]
}

function saveLayout(layout) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(layout));
  } catch { /* ignore */ }
}

// ─────────────────────────────────────────────
// SensorMini — thanh cảm biến nhỏ dưới ô camera
// ─────────────────────────────────────────────
const SensorMini = ({ data = {} }) => {
  const temp = data.temperature;
  const gas = data.gasPercent;
  const smoke = data.smoke;
  const flame = data.flame;

  return (
    <div className="ovd-sensor-bar">
      {temp !== undefined && (
        <span className={`ovd-sensor-chip ${temp > 60 ? 'danger' : temp > 45 ? 'warn' : 'ok'}`}>
          <FaTemperatureHigh /> {temp}°C
        </span>
      )}
      {gas !== undefined && (
        <span className={`ovd-sensor-chip ${gas > 700 ? 'danger' : gas > 400 ? 'warn' : 'ok'}`}>
          <MdOutlineGasMeter /> {gas}%
        </span>
      )}
      {smoke !== undefined && (
        <span className={`ovd-sensor-chip ${smoke === 1 ? 'danger' : 'ok'}`}>
          <WiSmoke /> {smoke === 1 ? 'CÓ KHÓI' : 'AN TOÀN'}
        </span>
      )}
      {flame !== undefined && (
        <span className={`ovd-sensor-chip ${flame === 1 ? 'danger' : 'ok'}`}>
          <FaFire /> {flame === 1 ? 'CÓ LỬA' : 'AN TOÀN'}
        </span>
      )}
      {Object.keys(data).length === 0 && (
        <span className="ovd-sensor-chip ok" style={{ opacity: 0.5 }}>Chờ cảm biến...</span>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// CameraCell — một ô trong lưới 2×2
// ─────────────────────────────────────────────
const CameraCell = ({
  slotIndex,
  camera,            // null | camera object
  cameras,           // toàn bộ camera chưa được gán
  onAssign,          // (slotIndex, cameraId) => void
  onDragStart,
  onDragOver,
  onDrop,
  imgRef,
  hasStream,
  sensorData,
  isAlarm,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);

  const available = cameras.filter((c) => c !== null);

  const handleSelect = (e) => {
    const val = e.target.value;
    if (val) {
      onAssign(slotIndex, Number(val));
      setShowDropdown(false);
    }
  };

  return (
    <div
      className={`ovd-cell${isAlarm ? ' is-alarm' : ''}`}
      draggable={!!camera}
      onDragStart={() => onDragStart(slotIndex)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(slotIndex); }}
      onDrop={() => onDrop(slotIndex)}
    >
      {camera ? (
        <>
          {/* ── Video area ── */}
          <div className="ovd-video-wrap">
            <button
              className="ovd-clear-btn"
              onClick={(e) => { e.stopPropagation(); onAssign(slotIndex, null); }}
              title="Bỏ chọn camera này"
            >✕</button>

            {camera.status === 'not_binded' ? (
              <div className="ovd-video-placeholder" style={{ color: '#ef4444' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.8 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.163a1 1 0 111.414 1.414M3 3l18 18" />
                </svg>
                <span>Chưa đồng bộ</span>
              </div>
            ) : camera.status === 'offline' ? (
              <div className="ovd-video-placeholder" style={{ color: '#ef4444' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.8 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.163a1 1 0 111.414 1.414M3 3l18 18" />
                </svg>
                <span>Ngoại tuyến</span>
              </div>
            ) : (
              <>
                <img
                  ref={(el) => { if (imgRef) imgRef.current = el; }}
                  alt={`Live ${camera.name}`}
                  className="ovd-video-img"
                  style={{ display: hasStream ? 'block' : 'none' }}
                />
                {!hasStream && (
                  <div className="ovd-video-placeholder">
                    <div className="ovd-spinner" />
                    <span>Đang kết nối...</span>
                  </div>
                )}
              </>
            )}

            {/* Alarm overlay — nhấp nháy đỏ */}
            {isAlarm && (
              <div className="ovd-alarm-overlay">
                <span className="ovd-alarm-badge">CẢNH BÁO CHÁY</span>
              </div>
            )}
          </div>

          {/* ── Sensor bar ── */}
          {camera.status === 'not_binded' ? (
            <div className="ovd-sensor-bar" style={{ justifyContent: 'center' }}>
              <span className="ovd-sensor-chip danger" style={{ background: 'transparent', border: '1px solid #ef4444' }}>
                Thiết bị chưa đồng bộ
              </span>
            </div>
          ) : camera.status === 'offline' ? (
            <div className="ovd-sensor-bar" style={{ justifyContent: 'center' }}>
              <span className="ovd-sensor-chip danger" style={{ background: 'transparent', border: '1px solid #ef4444' }}>
                Thiết bị ngoại tuyến
              </span>
            </div>
          ) : (
            <SensorMini data={sensorData} />
          )}
        </>
      ) : (
        /* ── Empty slot ── */
        <div className="ovd-empty-slot">
          <div className="ovd-empty-icon">＋</div>
          <p className="ovd-empty-hint">Chọn camera để hiển thị</p>
          <select
            className="ovd-camera-select"
            defaultValue=""
            onChange={handleSelect}
          >
            <option value="" disabled>— Chọn camera —</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || `Camera #${c.id}`}
                {c.room?.name ? ` (${c.room.name})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// OverviewDashboard — trang chính
// ─────────────────────────────────────────────
const OverviewDashboard = () => {
  const { cameras: allCameras, socket } = useContext(AppContext);

  // layout[i] = camera_id hoặc null
  const [layout, setLayout] = useState(loadLayout);

  // hasStream[camId] = boolean
  const [hasStream, setHasStream] = useState({});

  // sensorData[mac] = {temperature, gas, smoke, flame, ... }
  const [sensorData, setSensorData] = useState({});

  // alarmStates[camId] = boolean
  const [alarmStates, setAlarmStates] = useState({});

  // Drag & Drop
  const [dragFrom, setDragFrom] = useState(null);

  // imgRefs[camId] = {current: <img> }
  const imgRefs = useRef({});

  const alarmTimersRef = useRef({});

  // ── Main effect: socket lifecycle ──────────
  useEffect(() => {
    if (!socket || !allCameras || allCameras.length === 0) return;

    // Lắng nghe các sự kiện socket cho từng camera
    allCameras.forEach((cam) => {
      const { id, macAddress } = cam;

      // Đảm bảo ref tồn tại
      if (!imgRefs.current[id]) {
        imgRefs.current[id] = { current: null };
      }

      socket.on(`VIDEO_FRAME_${id}`, (b64) => {
        const src = b64.startsWith('data:image') ? b64 : `data:image/jpeg;base64,${b64}`;
        const el = imgRefs.current[id]?.current;
        if (el) el.src = src;
        setHasStream((prev) => prev[id] ? prev : { ...prev, [id]: true });
      });

      if (macAddress) {
        socket.on(`SENSOR_DATA_${macAddress}`, (data) => {
          setSensorData((prev) => ({
            ...prev,
            [macAddress]: { ...(prev[macAddress] || {}), ...data }
          }));
        });
      }
    });

    // FIRE_ALARM
    socket.on('FIRE_ALARM', (data) => {
      const camId = data.camera_id;
      setAlarmStates((prev) => ({ ...prev, [camId]: true }));
      clearTimeout(alarmTimersRef.current[camId]);
      alarmTimersRef.current[camId] = setTimeout(() => {
        setAlarmStates((prev) => ({ ...prev, [camId]: false }));
      }, 10000);
    });

    return () => {
      // Hủy đăng ký lắng nghe sự kiện để tránh rò rỉ bộ nhớ
      allCameras.forEach((cam) => {
        const { id, macAddress } = cam;
        socket.off(`VIDEO_FRAME_${id}`);
        if (macAddress) {
          socket.off(`SENSOR_DATA_${macAddress}`);
        }
      });
      socket.off('FIRE_ALARM');

      Object.values(alarmTimersRef.current).forEach(clearTimeout);
      alarmTimersRef.current = {};
    };
  }, [socket, allCameras]);

  // ── Persist layout khi thay đổi ───────────
  useEffect(() => {
    saveLayout(layout);
  }, [layout]);

  // ── Gán camera vào ô ──────────────────────
  const handleAssign = useCallback((slotIndex, cameraId) => {
    setLayout((prev) => {
      const next = [...prev];
      if (cameraId !== null) {
        const existingSlot = next.findIndex((id) => id === cameraId);
        if (existingSlot !== -1) next[existingSlot] = null;
      }
      next[slotIndex] = cameraId;
      return next;
    });
  }, []);

  // ── Drag & Drop ───────────────────────────
  const handleDragStart = useCallback((slotIndex) => {
    setDragFrom(slotIndex);
  }, []);

  const handleDragOver = useCallback((_slotIndex) => {
    // allow drop — noop (preventDefault đã ở onDragOver của CameraCell)
  }, []);

  const handleDrop = useCallback((toSlot) => {
    if (dragFrom === null || dragFrom === toSlot) {
      setDragFrom(null);
      return;
    }
    setLayout((prev) => {
      const next = [...prev];
      [next[dragFrom], next[toSlot]] = [next[toSlot], next[dragFrom]];
      return next;
    });
    setDragFrom(null);
  }, [dragFrom]);

  // ── Derived: map cameraId → camera object ─
  const cameraMap = {};
  allCameras.forEach((c) => { cameraMap[c.id] = c; });

  // Camera hiển thị trong lưới
  const gridCameras = layout.map((id) => (id !== null ? cameraMap[id] || null : null));

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-title">
          Giám sát tổng quan
        </div>
        <div className="page-description">
          Xem 4 camera cùng lúc. Kéo thả để thay đổi vị trí, chọn camera cho ô trống.
        </div>
      </div>

      {allCameras.length === 0 ? (
        /* ── Empty State: chưa có camera nào ── */
        <div className="ovd-empty" style={{ minHeight: '340px' }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
            <rect x="2" y="8" width="14" height="12" rx="2" />
            <path d="m22 8-4 4 4 4V8z" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
          <p>Chưa có camera nào được thêm vào hệ thống.</p>
          <a
            href="/management/cameras"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '4px',
              padding: '8px 18px',
              background: 'var(--accent, #f97316)',
              color: '#fff',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'opacity 0.2s',
            }}
            onMouseOver={(e) => { e.currentTarget.style.opacity = '0.85'; }}
            onMouseOut={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            + Thêm camera mới
          </a>
        </div>
      ) : (
        /* ── 2×2 Grid ── */
        <div className="ovd-grid">
          {gridCameras.map((cam, idx) => {
            // imgRefs lưu theo camId (không theo slot — tránh bug khi hoán vị)
            const camId = cam?.id;
            if (camId && !imgRefs.current[camId]) {
              imgRefs.current[camId] = { current: null };
            }

            const mac = cam?.macAddress;
            const sensor = mac ? (sensorData[mac] || {}) : {};

            return (
              <CameraCell
                key={idx}
                slotIndex={idx}
                camera={cam}
                cameras={allCameras}
                onAssign={handleAssign}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                imgRef={camId ? imgRefs.current[camId] : null}
                hasStream={camId ? !!hasStream[camId] : false}
                sensorData={sensor}
                isAlarm={camId ? !!alarmStates[camId] : false}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OverviewDashboard;
