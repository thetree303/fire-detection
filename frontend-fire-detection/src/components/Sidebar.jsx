import { useEffect, useState, useContext } from 'react';
import { NavLink, useParams, useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import './Sidebar.css';

// ─────────────────────────────────────────────
// Sidebar
// Props mới:
//   isOpen  — boolean: mở/đóng drawer trên mobile
//   onClose — callback: đóng drawer (click vào nav item)
// ─────────────────────────────────────────────
const Sidebar = ({ onLogout, cameraStatuses = {}, isOpen = false, onClose }) => {
  const { cameraId } = useParams();
  const navigate = useNavigate();
  const { user, rooms: rawRooms, cameras: rawCameras, loading } = useContext(AppContext);
  const [openRooms, setOpenRooms] = useState({});
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    if (!rawRooms || !rawCameras) return;

    // Lọc camera KHÔNG thuộc phòng nào
    const unassignedCameras = rawCameras.filter(
      (cam) => !cam.room && !cam.room_id && !cam.roomId,
    );

    // Tạo nhóm giả lập "Chưa xếp phòng" nếu có camera nằm ngoài phòng
    const finalRooms =
      unassignedCameras.length > 0
        ? [
          ...rawRooms,
          {
            id: 'unassigned',
            name: 'Chưa xếp phòng',
            description: 'Các camera chưa được gán vào phòng nào',
            cameras: unassignedCameras,
          },
        ]
        : rawRooms;

    setRooms(finalRooms);

    // Tự mở phòng chứa camera đang xem
    setOpenRooms((prev) => {
      const initialOpen = { ...prev };
      finalRooms.forEach((room) => {
        const hasCurrent = room.cameras?.some((c) => String(c.id) === String(cameraId));
        if (hasCurrent) {
          initialOpen[room.id] = true;
        }
      });
      return initialOpen;
    });
  }, [rawRooms, rawCameras, cameraId]);

  const toggleRoom = (roomId) => {
    setOpenRooms((prev) => ({ ...prev, [roomId]: !prev[roomId] }));
  };

  // Đóng drawer khi click nav item trên mobile
  const handleNavClick = () => {
    if (onClose) onClose();
  };

  return (
    <div className={`sidebar${isOpen ? ' is-open' : ''}`}>
      {/* ── Brand Header ── */}
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">Fire Detector</span>
            <span className="sidebar-brand-sub">Smart System</span>
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="sidebar-nav">
        {/* Camera section */}
        <span className="nav-section-label">Giám sát</span>

        <NavLink
          to="/overview"
          className={({ isActive }) => {
            // Sáng lên cả khi ở / (trang chủ) lẫn /overview
            const atHome = window.location.pathname === '/';
            return `nav-item${(isActive || atHome) ? ' active' : ''}`;
          }}
          onClick={handleNavClick}
        >
          <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="2" width="9" height="9" rx="1" />
            <rect x="13" y="2" width="9" height="9" rx="1" />
            <rect x="2" y="13" width="9" height="9" rx="1" />
            <rect x="13" y="13" width="9" height="9" rx="1" />
          </svg>
          Tổng quan
        </NavLink>

        {loading ? (
          <div className="sidebar-loading">
            {[1, 2, 3].map((i) => (
              <div key={i}>
                <div className="skeleton-line" />
                <div className="skeleton-line indent" />
                <div className="skeleton-line indent short" />
              </div>
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <div style={{ padding: '10px 16px', fontSize: '14px', color: 'var(--sidebar-text-muted)' }}>
            Chưa có phòng nào
          </div>
        ) : (
          rooms.map((room) => (
            <div key={room.id} className="room-group">
              <div
                className="room-toggle"
                onClick={() => toggleRoom(room.id)}
                title={room.description || room.name}
              >
                <span className="room-toggle-left">
                  {room.id === 'unassigned' ? (
                    /* Icon khác cho nhóm "Chưa xếp phòng" */
                    <svg className="room-icon" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="room-icon" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                    </svg>
                  )}
                  <span className="room-toggle-name">{room.name}</span>
                  {room.cameras?.length > 0 && (
                    <span className="room-cam-count">{room.cameras.length}</span>
                  )}
                </span>
                <span className={`room-chevron${openRooms[room.id] ? ' open' : ''}`}>▶</span>
              </div>

              <div className={`camera-list${openRooms[room.id] ? ' open' : ''}`}>
                {room.cameras && room.cameras.length > 0 ? (
                  room.cameras.map((camera) => {
                    const status = cameraStatuses[camera.id] || camera.status || 'offline';
                    return (
                      <NavLink
                        key={camera.id}
                        to={`/camera/${camera.id}`}
                        className={({ isActive }) => `camera-item${isActive ? ' active' : ''}`}
                        onClick={handleNavClick}
                      >
                        <span className={`camera-status-dot ${status}`} title={status} />
                        {camera.name || `Camera #${camera.id}`}
                      </NavLink>
                    );
                  })
                ) : (
                  <div style={{ padding: '5px 16px 5px 34px', fontSize: '13px', color: 'var(--sidebar-text-muted)' }}>
                    Chưa có camera
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {/* Management section */}
        <span className="nav-section-label" style={{ marginTop: '8px' }}>Quản lý</span>

        <NavLink
          to="/alerts"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={handleNavClick}
        >
          <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Lịch sử Cảnh báo
        </NavLink>

        <NavLink
          to="/management/rooms"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={handleNavClick}
        >
          <svg className="nav-item-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
          </svg>
          Quản lý Phòng
        </NavLink>

        <NavLink
          to="/management/cameras"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={handleNavClick}
        >
          <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="8" width="14" height="12" rx="2" />
            <path d="m22 8-4 4 4 4V8z" />
          </svg>
          Quản lý Camera
        </NavLink>

        <NavLink
          to="/profile"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={handleNavClick}
        >
          <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="10" cy="7" r="4" />
          </svg>
          Thông tin cá nhân
        </NavLink>

        {onLogout && (
          <button className="btn-logout" onClick={onLogout} id="sidebar-logout-btn">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
            </svg>
            Đăng xuất
          </button>
        )}
      </nav>
    </div>
  );
};

export default Sidebar;