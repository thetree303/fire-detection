import { useEffect, useState, useCallback, useContext } from 'react';
import { AppProvider, AppContext } from './context/AppContext';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import CameraView from './pages/CameraView';
import RoomManagement from './pages/RoomManagement';
import CameraManagement from './pages/CameraManagement';
import ProfilePage from './pages/ProfilePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import OverviewDashboard from './pages/OverviewDashboard';
import AlertHistory from './pages/AlertHistory';
import api from './utils/axios';
import { onMessageListener, clearFcmToken } from './utils/firebase';
import './App.css';

// ─────────────────────────────────────────────
// ProtectedRoute — Kiểm tra phiên đăng nhập qua cookie
// ─────────────────────────────────────────────


const ProtectedRoute = ({ children }) => {
  const { fetchData } = useContext(AppContext);
  const [authState, setAuthState] = useState('checking'); // 'checking' | 'ok' | 'fail'

  useEffect(() => {
    // Gọi hàm fetch data từ Context (gọi /users và nạp state)
    fetchData()
      .then(() => {
        setAuthState('ok');
      })
      .catch(() => setAuthState('fail'));
  }, [fetchData]);

  if (authState === 'checking') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100dvh', background: 'var(--bg-primary, #0f1117)',
        color: 'var(--text-secondary, #888)', fontSize: '14px', gap: '10px',
      }}>
        <div style={{
          width: 20, height: 20, border: '2px solid #555',
          borderTopColor: 'var(--accent, #f97316)', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        Đang xác thực...
      </div>
    );
  }

  if (authState === 'fail') return <Navigate to="/login" replace />;
  return children;
};

// ─────────────────────────────────────────────
// HamburgerIcon — SVG icon 3 gạch ngang
// ─────────────────────────────────────────────
const HamburgerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

// ─────────────────────────────────────────────
// AppShell — Layout 3 cột (Sidebar | Main | RightPanel)
// Quản lý trạng thái mở/đóng Sidebar trên mobile.
// cameraStatuses: { [id]: 'online' | 'offline' } được quản lý
// ở đây để Sidebar có thể hiển thị chấm màu realtime.
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// FireAlertToast — Toast hiển thị khi nhận được cảnh báo lúc đang mở App
// ─────────────────────────────────────────────
const FireAlertToast = ({ toast, onClose }) => {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onClose, 8000); // Tự đóng sau 8 giây
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  return (
    <div
      id="fire-alert-toast"
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 9999,
        background: '#ffffff',
        border: '2px solid rgba(255, 106, 0, 0.6)',
        borderRadius: '15px',
        padding: '16px 20px',
        maxWidth: '380px',
        animation: 'toastSlideIn 0.3s ease-out',
        boxShadow: '0 0 12px rgba(0, 0, 0, 0.2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <div style={{
            color: '#f97316',
            fontWeight: 900,
            fontSize: '15px',
            letterSpacing: '1px',
            marginBottom: '4px',
          }}>
            {toast.title || 'CẢNH BÁO CHÁY!'}
          </div>
          <div style={{ color: '#000000ff', fontSize: '13px', lineHeight: 1.5 }}>
            {toast.body}
          </div>
          {toast.imageUrl && (
            <img
              src={toast.imageUrl}
              alt="Ảnh cảnh báo"
              style={{
                marginTop: '8px',
                width: '100%',
                borderRadius: '8px',
                maxHeight: '120px',
                objectFit: 'cover',
                border: '1px solid rgba(249,115,22,0.3)',
              }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Đóng thông báo"
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '0',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// AppShell — Layout 3 cột (Sidebar | Main | RightPanel)
// Quản lý trạng thái mở/đóng Sidebar trên mobile.
// cameraStatuses: { [id]: 'online' | 'offline' } được quản lý
// ở đây để Sidebar có thể hiển thị chấm màu realtime.
// ─────────────────────────────────────────────
const AppShell = ({ children, showRightPanel }) => {
  const { resetContext } = useContext(AppContext);
  const navigate = useNavigate();
  const [cameraStatuses, setCameraStatuses] = useState({});
  const [fireToast, setFireToast] = useState(null); // { title, body, imageUrl }

  // ── State: mobile sidebar open/close ──────
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const openSidebar = () => setSidebarOpen(true);
  const closeSidebar = () => setSidebarOpen(false);

  // Đóng sidebar khi resize lên desktop
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handleChange = (e) => { if (!e.matches) setSidebarOpen(false); };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  // ── Lắng nghe Foreground FCM Message ──────
  useEffect(() => {
    const unsubscribe = onMessageListener((payload) => {
      const { data } = payload;
      setFireToast({
        title: data?.title || 'CẢNH BÁO CHÁY!',
        body: data?.message || 'Phát hiện nguy hiểm, hãy kiểm tra ngay!',
        imageUrl: data?.image_url || null,
      });
    });
    // Dọn dẹp listener khi component unmount
    return () => unsubscribe();
  }, []);

  const handleStatusChange = useCallback((cameraId, status) => {
    setCameraStatuses((prev) => {
      if (prev[cameraId] === status) return prev;
      return { ...prev, [cameraId]: status };
    });
  }, []);

  const handleLogout = async () => {
    try {
      // Bước 1: Xóa token khỏi Firebase, backend DB và localStorage
      await clearFcmToken();

      // Bước 2: Đăng xuất khỏi server
      await api.post('/auth/logout');
    } catch (e) {
      console.error('Lỗi đăng xuất', e);
    } finally {
      resetContext();
      navigate('/login');
    }
  };

  return (
    <div className="app-container">
      {/* ── Fire Alert Toast (Foreground FCM) ── */}
      <FireAlertToast
        toast={fireToast}
        onClose={() => setFireToast(null)}
      />

      {/* ── Overlay mờ khi mở sidebar trên mobile ── */}
      <div
        className={`sidebar-overlay${sidebarOpen ? ' active' : ''}`}
        onClick={closeSidebar}
        aria-hidden="true"
      />

      {/* ── Sidebar (nhận prop isOpen để toggle class .is-open) ── */}
      <Sidebar
        onLogout={handleLogout}
        cameraStatuses={cameraStatuses}
        isOpen={sidebarOpen}
        onClose={closeSidebar}
      />

      {showRightPanel
        ? children(handleStatusChange, openSidebar)
        : (
          <div className="main-area">
            {/* Topbar cho management pages — chứa nút hamburger */}
            <ManagementTopbar onOpenSidebar={openSidebar} />
            {children}
          </div>
        )
      }
    </div>
  );
};

// ─────────────────────────────────────────────
// ManagementTopbar — Topbar đơn giản cho các trang quản lý
// Chỉ hiển thị trên mobile
// ─────────────────────────────────────────────
const ManagementTopbar = ({ onOpenSidebar }) => (
  <div className="management-topbar">
    <button
      className="hamburger-btn"
      onClick={onOpenSidebar}
      aria-label="Mở menu"
      id="management-hamburger-btn"
    >
      <HamburgerIcon />
    </button>

    {/* Khối Logo hiển thị trên Mobile */}
    <div className="mobile-topbar-brand">
      <span className="mobile-brand-name">Fire Detector</span>
      <span className="mobile-brand-sub">Smart System</span>
    </div>
  </div>
);
// ─────────────────────────────────────────────
// App root
// ─────────────────────────────────────────────
function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected — Camera dashboard (3-column) */}
          <Route
            path="/camera/:cameraId"
            element={
              <ProtectedRoute>
                {/* 1. Đổi showRightPanel thành true */}
                <AppShell showRightPanel={true}>
                  {(handleStatusChange, openSidebar) => (
                    <CameraView
                      onStatusChange={handleStatusChange}
                      onOpenSidebar={openSidebar}
                      // 2. Truyền Topbar chung vào làm Prop
                      SharedTopbar={ManagementTopbar}
                    />
                  )}
                </AppShell>
              </ProtectedRoute>
            }
          />

          {/* Protected — Management pages (2-column: sidebar + full content) */}
          <Route
            path="/management/rooms"
            element={
              <ProtectedRoute>
                <AppShell showRightPanel={false}>
                  <RoomManagement />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/management/cameras"
            element={
              <ProtectedRoute>
                <AppShell showRightPanel={false}>
                  <CameraManagement />
                </AppShell>
              </ProtectedRoute>
            }
          />

          {/* Protected — Overview Dashboard (2×2 grid) — cả / lẫn /overview đều trỏ tới đây */}
          <Route
            path="/overview"
            element={
              <ProtectedRoute>
                <AppShell showRightPanel={false}>
                  <OverviewDashboard />
                </AppShell>
              </ProtectedRoute>
            }
          />

          {/* Protected — Alert History (global) */}
          <Route
            path="/alerts"
            element={
              <ProtectedRoute>
                <AppShell showRightPanel={false}>
                  <AlertHistory />
                </AppShell>
              </ProtectedRoute>
            }
          />

          {/* Protected — Profile page */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <AppShell showRightPanel={false}>
                  <ProfilePage />
                </AppShell>
              </ProtectedRoute>
            }
          />

          {/* Trang chủ → trỏ thẳng đến Giám sát tổng quan */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppShell showRightPanel={false}>
                  <OverviewDashboard />
                </AppShell>
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}

export default App;