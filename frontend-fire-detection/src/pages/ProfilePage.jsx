import { useEffect, useState } from 'react';
import api from '../utils/axios';
import { requestForToken } from '../utils/firebase';

const ProfilePage = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // States for FCM & PWA
  const [fcmLoading, setFcmLoading] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);
  const [isStandaloneMode, setIsStandaloneMode] = useState(false);

  const isIos = () => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  };

  const isStandalone = () => {
    return (window.navigator.standalone) || (window.matchMedia('(display-mode: standalone)').matches);
  };

  useEffect(() => {
    setIsIosDevice(isIos());
    setIsStandaloneMode(isStandalone());
  }, []);

  const handleEnableNotification = async () => {
    setFcmLoading(true);
    try {
      const result = await requestForToken();
      if (result && result.token) {
        const response = await api.put('/users/fcm-token', { token: result.token });
        if (response.data?.success || response.status === 200) {
          showToast('Bật thông báo cảnh báo cháy thành công!');
        } else {
          showToast('Không thể lưu token thông báo lên hệ thống', 'error');
        }
      } else {
        showToast('Quyền thông báo bị từ chối hoặc không được hỗ trợ', 'error');
      }
    } catch (error) {
      console.error('Error enabling notifications:', error);
      showToast('Đã xảy ra lỗi khi đăng ký nhận thông báo', 'error');
    } finally {
      setFcmLoading(false);
    }
  };

  // Editable fields
  const [userName, setUserName] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    api.get('/users')
      .then((res) => {
        setUser(res.data);
        setUserName(res.data.username || '');
        setEmail(res.data.email || '');
        setDisplayName(res.data.name || '');
      })
      .catch(() => showToast('Không thể tải thông tin người dùng', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password && password !== confirmPassword) {
      showToast('Mật khẩu xác nhận không khớp', 'error');
      return;
    }

    const payload = { name: displayName.trim() };
    if (password) {
      payload.passwordHash = password;
    }

    setSaving(true);
    try {
      const res = await api.put('/users', payload);
      setUser(res.data);
      setPassword('');
      setConfirmPassword('');
      showToast('Cập nhật thông tin thành công!');
    } catch (err) {
      const msg = err?.response?.data?.message;
      showToast(Array.isArray(msg) ? msg.join(', ') : (msg || 'Lỗi khi cập nhật'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-secondary)' }}>
          <div style={{
            width: 20, height: 20, border: '2px solid var(--border-light)',
            borderTopColor: 'var(--accent)', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          Đang tải thông tin...
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-title">
          Thông tin cá nhân
        </div>
        <div className="page-description">Xem và cập nhật thông tin tài khoản của bạn</div>
      </div>

      <div className="profile-grid">
        {/* ── Avatar / Info Card ── */}
        <div className="card profile-info-card">
          <div className="card-body" style={{ textAlign: 'center', padding: '32px 20px' }}>
            <div className="profile-avatar">
              {user?.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="profile-display-name">{user?.name}</div>
            <div className="profile-username">@{user?.username}</div>
            <div className="profile-email">{user?.email}</div>

            <div className="profile-meta-list">
              <div className="profile-meta-item">
                <span className="profile-meta-label">Trạng thái</span>
                <span className="badge badge-green">Đang hoạt động</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right Column (Edit Form & Push Notifications) ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* ── Edit Form Card ── */}
          <div className="card">
            <div className="card-header">
              <h3>Cập nhật thông tin</h3>
            </div>
            <div className="card-body">
              <form onSubmit={handleSubmit}>

                {/* Editable: Username */}
                <div className="form-group">
                  <label>Tên đăng nhập</label>
                  <input
                    id="profile-username"
                    className="form-control"
                    type="text"
                    placeholder="Nhập tên đăng nhập"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    required
                    onInvalid={(e) => e.target.setCustomValidity("Vui lòng nhập tên đăng nhập")}
                    onInput={(e) => e.target.setCustomValidity("")}
                  />
                </div>

                {/* Editable: Email */}
                <div className="form-group">
                  <label>Email</label>
                  <input
                    id="profile-email"
                    className="form-control"
                    type="email"
                    placeholder="Nhập email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    onInvalid={(e) => e.target.setCustomValidity("Vui lòng nhập email")}
                    onInput={(e) => e.target.setCustomValidity("")}
                  />
                </div>

                {/* Editable: Display Name */}
                <div className="form-group">
                  <label htmlFor="profile-name">Tên hiển thị</label>
                  <input
                    id="profile-name"
                    className="form-control"
                    type="text"
                    placeholder="Nhập tên hiển thị"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    onInvalid={(e) => e.target.setCustomValidity("Vui lòng nhập tên hiển thị")}
                    onInput={(e) => e.target.setCustomValidity("")}
                  />
                </div>

                <div className="form-section-divider">
                  <span>Đổi mật khẩu (để trống nếu không muốn đổi)</span>
                </div>

                {/* New Password */}
                <div className="form-group">
                  <label htmlFor="profile-password">Mật khẩu mới</label>
                  <input
                    id="profile-password"
                    className="form-control"
                    type="password"
                    placeholder="Nhập mật khẩu mới..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>

                {/* Confirm Password */}
                <div className="form-group">
                  <label htmlFor="profile-confirm-password">Xác nhận mật khẩu mới</label>
                  <input
                    id="profile-confirm-password"
                    className="form-control"
                    type="password"
                    placeholder="Nhập lại mật khẩu mới..."
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  {password && confirmPassword && password !== confirmPassword && (
                    <div style={{ fontSize: '12px', color: 'var(--red)', marginTop: '5px' }}>
                      ⚠ Mật khẩu xác nhận không khớp
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-full"
                  disabled={saving || (password !== '' && password !== confirmPassword)}
                  style={{ marginTop: '8px' }}
                >
                  {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </form>
            </div>
          </div>

          {/* ── Push Notification Card ── */}
          <div className="card">
            <div className="card-header">
              <h3>Cài đặt Thông báo (Push Notification)</h3>
            </div>
            <div className="card-body">
              {isIosDevice && !isStandaloneMode ? (
                <div style={{
                  background: 'var(--orange-dim, rgba(234, 88, 12, 0.1))',
                  border: '1.5px solid var(--orange, #ea580c)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '16px',
                  color: 'var(--text-primary)',
                  fontSize: '15px',
                  lineHeight: '1.6',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', color: 'var(--orange)', marginBottom: '8px' }}>
                    <span>⚠ Yêu cầu cài đặt PWA</span>
                  </div>
                  <p>
                    Để nhận được thông báo cảnh báo cháy trên iPhone, vui lòng nhấn nút Chia sẻ <strong>⍗</strong> ở dưới cùng của trình duyệt và chọn <strong>'Thêm vào MH chính' (Add to Home Screen)</strong>. Sau đó mở ứng dụng từ màn hình chính để cài đặt.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>Trạng thái nhận tin</span>
                  </div>
                  <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                    Kích hoạt tính năng này để nhận thông báo cảnh báo cháy ngay lập tức trên thiết bị của bạn khi có sự cố xảy ra.
                  </p>
                  <button
                    onClick={handleEnableNotification}
                    className="btn btn-primary btn-full"
                    disabled={fcmLoading}
                    style={{ marginTop: '8px' }}
                  >
                    {fcmLoading ? (
                      <>
                        <div className="btn-spinner" /> Đang thiết lập...
                      </>
                    ) : (
                      'Bật thông báo cảnh báo cháy'
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
