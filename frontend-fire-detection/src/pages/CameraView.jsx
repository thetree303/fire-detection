import { useEffect, useRef, useState, useCallback, useContext } from 'react';
import { useParams } from 'react-router-dom';
import api, { BACKEND_URL } from '../utils/axios';
import { AppContext } from '../context/AppContext';
import RightPanel from '../components/RightPanel';
import CameraInfoPanel from '../components/CameraInfoPanel';
import './css/CameraView.css';

// ─────────────────────────────────────────────
// CameraView — Cột 2 (video grid) + Cột 3 (right panel)
// Được nhúng bên trong CameraPage khi có cameraId
// Props: onStatusChange - callback báo status lên sidebar
// ─────────────────────────────────────────────
const CameraView = ({ onStatusChange, onOpenSidebar, SharedTopbar }) => {
  const { cameraId } = useParams();
  const { cameras, socket } = useContext(AppContext);

  // ── SỬA LỖI 1: Lấy trực tiếp thông tin camera, KHÔNG dùng useState ──
  const cameraInfo = cameras?.find((c) => c.id === Number(cameraId)) || null;

  // ── State ──
  const [localStatus, setLocalStatus] = useState(null);
  const cameraStatus = localStatus || cameraInfo?.status || 'not_binded';

  const imgRefs = useRef({});
  const [hasStream, setHasStream] = useState({});
  const [sensorData, setSensorData] = useState({});
  const [alarmStates, setAlarmStates] = useState({});
  const [activeAlarm, setActiveAlarm] = useState(null);
  const [alertHistory, setAlertHistory] = useState([]);
  const alarmTimersRef = useRef({});

  const fetchHistory = useCallback(async () => {
    try {
      const res = await api.get('/alerts');
      const filtered = res.data
        .filter((a) => a.camera?.id === Number(cameraId) || a.camera_id === Number(cameraId))
        .sort((a, b) => new Date(b.detectedAt || b.detected_at) - new Date(a.detectedAt || a.detected_at));
      setAlertHistory(filtered);
    } catch { /* silent */ }
  }, [cameraId]);

  const handleResolve = useCallback(async (alertId) => {
    try {
      await api.put(`/alerts/handle/${alertId}`);
      setAlertHistory((prev) =>
        prev.map((a) => a.id === alertId ? { ...a, isResolved: true } : a),
      );
    } catch { /* silent */ }
  }, []);

  // ── BÁO CÁO STATUS LÊN SIDEBAR ──
  useEffect(() => {
    if (cameraInfo && onStatusChange) {
      onStatusChange(cameraInfo.id, cameraStatus);
    }
  }, [cameraInfo?.id, cameraStatus, onStatusChange]);

  // ── SỬA LỖI 2: CHỈ RESET STATE KHI CHUYỂN TRANG CAMERA KHÁC ──
  useEffect(() => {
    setHasStream({});
    imgRefs.current = {};
    setSensorData({});
    setActiveAlarm(null);
    setLocalStatus(null);
    fetchHistory();
  }, [cameraId, fetchHistory]);

  // ── SOCKET LISTENERS ────────────────────────────
  useEffect(() => {
    if (!socket || !cameras || cameras.length === 0) return;

    const currentCamId = Number(cameraId);

    // Đăng ký listeners cho từng camera
    cameras.forEach((cam) => {
      const id = cam.id;
      const mac = cam.macAddress;

      socket.on(`VIDEO_FRAME_${id}`, (b64) => {
        const imgSrc = b64.startsWith('data:image') ? b64 : `data:image/jpeg;base64,${b64}`;
        if (imgRefs.current[id]) {
          imgRefs.current[id].src = imgSrc;
        }
        // Chỉ cập nhật state nếu chưa có stream để tránh re-render liên tục
        setHasStream((prev) => prev[id] ? prev : { ...prev, [id]: true });
      });

      if (mac) {
        socket.on(`SENSOR_DATA_${mac}`, (data) => {
          if (id === currentCamId) {
            setSensorData((prev) => ({ ...prev, ...data }));
          }
        });
      }
    });

    const handleDeviceStatus = ({ camera_id, status }) => {
      if (camera_id === currentCamId) {
        setLocalStatus(status);
        if (status === 'offline' || status === 'not_binded') {
          setHasStream((prev) => ({ ...prev, [camera_id]: false }));
          setSensorData({});
        }
      }
    };

    const handleFireAlarm = (data) => {
      const alarmCamId = data.camera_id;
      setAlarmStates((prev) => ({ ...prev, [alarmCamId]: true }));

      if (alarmCamId === currentCamId) {
        setActiveAlarm(data);
        fetchHistory();
      }

      clearTimeout(alarmTimersRef.current[alarmCamId]);
      alarmTimersRef.current[alarmCamId] = setTimeout(() => {
        setAlarmStates((prev) => ({ ...prev, [alarmCamId]: false }));
        if (alarmCamId === currentCamId) setActiveAlarm(null);
      }, 10000);
    };

    socket.on('DEVICE_STATUS_CHANGED', handleDeviceStatus);
    socket.on('FIRE_ALARM', handleFireAlarm);

    return () => {
      // Clean up gọn gàng
      cameras.forEach((cam) => {
        socket.off(`VIDEO_FRAME_${cam.id}`);
        if (cam.macAddress) socket.off(`SENSOR_DATA_${cam.macAddress}`);
      });
      socket.off('DEVICE_STATUS_CHANGED', handleDeviceStatus);
      socket.off('FIRE_ALARM', handleFireAlarm);
    };
  }, [cameraId, cameras, socket, fetchHistory]);

  // ── Derived values ─────────────────────────
  const roomName = cameraInfo?.room?.name;
  const cameraName = cameraInfo?.name;
  const isDanger = !!activeAlarm;

  // Only show the currently selected camera in the grid
  const gridCameras = cameraInfo ? [cameraInfo] : [];
  const gridColClass = gridCameras.length === 1 ? 'single' : gridCameras.length === 2 ? 'two' : '';

  return (
    <div className='cv-layout'>
      {/* Top bar */}
      {SharedTopbar && <SharedTopbar onOpenSidebar={onOpenSidebar} />}

      <div className="cv-main-wrapper">
        {/* ── CENTER COLUMN ─────────────────── */}
        <div className="cv-center">
          {/* Content */}
          <div className="cv-content-scroll">
            <div className="camera-page-header">
              <div>
                <div className="camera-header-title">{cameraName}</div>
                {roomName && <div className="camera-header-breadcrumb">{roomName}</div>}
                {cameraInfo?.description && (
                  <div className="camera-header-description">{cameraInfo.description}</div>
                )}
              </div>
              <div className={`topbar-status-badge ${cameraStatus}`}>
                <span className={`topbar-dot ${cameraStatus}`} />
                {cameraStatus === 'online' ? 'Online' : cameraStatus === 'offline' ? 'Offline' : 'Chưa đồng bộ'}
              </div>
            </div>

            {/* Fire alarm banner */}
            {activeAlarm && (
              <div className="fire-banner">
                <span>CẢNH BÁO CHÁY — {activeAlarm.message || 'Phát hiện nguy hiểm'}</span>
              </div>
            )}

            {/* Video grid */}
            {gridCameras.length === 0 ? (
              <div className="cv-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="8" width="14" height="12" rx="2" />
                  <path d="m22 8-4 4 4 4V8z" />
                  <line x1="2" y1="2" x2="22" y2="22" />
                </svg>
                <p>Chưa có camera nào. Hãy thêm thiết bị trong mục Quản lý Camera.</p>
              </div>
            ) : (
              <div className={`video-grid ${gridColClass}`}>
                {gridCameras.map((cam) => {
                  const isSelected = cam.id === Number(cameraId);
                  const isAlarm = !!alarmStates[cam.id];
                  const status = cam.status || 'not_binded';

                  return (
                    <div
                      key={cam.id}
                      className={`video-cell${isSelected ? ' is-selected' : ''}${isAlarm ? ' is-alarm' : ''}`}
                      onClick={() => {
                        if (!isSelected) window.location.href = `/camera/${cam.id}`;
                      }}
                      title={cam.name}
                    >
                      {/* KIỂM TRA OFFLINE CHO VIDEO */}
                      {status === 'not_binded' ? (
                        <div className="video-cell-placeholder" style={{ color: '#ef4444' }}>
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.8 }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.163a1 1 0 111.414 1.414M3 3l18 18" />
                          </svg>
                          <span>Camera chưa được đồng bộ</span>
                        </div>
                      ) : status === 'offline' ? (
                        <div className="video-cell-placeholder" style={{ color: '#ef4444' }}>
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.8 }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.163a1 1 0 111.414 1.414M3 3l18 18" />
                          </svg>
                          <span>Camera Ngoại tuyến</span>
                        </div>
                      ) : (
                        <>
                          <img
                            ref={(el) => (imgRefs.current[cam.id] = el)}
                            alt={`Live ${cam.name}`}
                            style={{ display: hasStream[cam.id] ? 'block' : 'none' }}
                          />
                          {!hasStream[cam.id] && (
                            <div className="video-cell-placeholder">
                              <div className="spinner" />
                              <span>Đang kết nối...</span>
                            </div>
                          )}
                        </>
                      )}

                      {/* Bottom label */}
                      <div className="video-cell-label">
                        <span className={`video-cell-status ${status}`} />
                        <span className="video-cell-name">{cam.name || `Camera #${cam.id}`}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Camera Info Panel — Thông tin + Cấu hình cảm biến */}
            {cameraInfo && <CameraInfoPanel camera={cameraInfo} />}
          </div>
        </div>

        {/* ── RIGHT PANEL (Cột 3) ───────────── */}
        <RightPanel
          cameraInfo={cameraInfo}
          sensorData={sensorData}
          alertHistory={alertHistory}
          onResolve={handleResolve}
          isDanger={isDanger}
        />
      </div>
    </div>
  );
};

export default CameraView;
