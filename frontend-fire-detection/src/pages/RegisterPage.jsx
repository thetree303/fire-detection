import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../utils/axios';

export default function RegisterPage() {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validate định dạng email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Email không hợp lệ');
      return;
    }

    // Validate mật khẩu khớp nhau
    if (password !== confirm) {
      setError('Mật khẩu xác nhận không khớp. Vui lòng kiểm tra lại.');
      return;
    }

    if (password.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }

    setLoading(true);
    try {
      // Backend dùng POST /users để tạo tài khoản mới
      await api.post('/users', {
        name: name.trim() || username.trim(),
        username: username.trim(),
        email: email.trim(),
        passwordHash: password,
      });

      setSuccess('Đăng ký thành công! Đang chuyển về trang đăng nhập...');
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch (err) {
      console.log(err);
      const msg = err.response?.data?.message || 'Đăng ký thất bại! Vui lòng thử lại.';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Header */}
        <h1 className="login-title">Fire Detector</h1>
        <p className="login-subtitle">Tạo tài khoản mới</p>

        <form onSubmit={handleSubmit} autoComplete="off">
          {/* Tên hiển thị */}
          <div className="form-group">
            <label>
              Tên hiển thị
              <span style={{
                color: 'var(--text-muted, #888)',
                fontWeight: 400,
                marginLeft: '4px',
                textTransform: 'none',
                fontSize: '12px',
                letterSpacing: 0,
              }}>
                (Tùy chọn)
              </span>
            </label>
            <input
              id="register-name"
              className="form-control"
              type="text"
              placeholder="VD: Nguyễn Văn A"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Tên đăng nhập */}
          <div className="form-group">
            <label>Tên đăng nhập</label>
            <input
              id="register-username"
              className="form-control"
              type="text"
              placeholder="VD: admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              onInvalid={(e) => e.target.setCustomValidity("Vui lòng nhập tên đăng nhập")}
              onInput={(e) => e.target.setCustomValidity("")}
            />
          </div>

          {/* Email */}
          <div className="form-group">
            <label>Email</label>
            <input
              id="register-email"
              className="form-control"
              type="email"
              placeholder="VD: admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              onInvalid={(e) => e.target.setCustomValidity("Vui lòng nhập email")}
              onInput={(e) => e.target.setCustomValidity("")}
            />
          </div>

          {/* Mật khẩu */}
          <div className="form-group">
            <label>Mật khẩu</label>
            <input
              id="register-password"
              className="form-control"
              type="password"
              placeholder="Ít nhất 6 ký tự"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              onInvalid={(e) => e.target.setCustomValidity("Vui lòng nhập mật khẩu")}
              onInput={(e) => e.target.setCustomValidity("")}
            />
          </div>

          {/* Xác nhận mật khẩu */}
          <div className="form-group">
            <label>Xác nhận mật khẩu</label>
            <input
              id="register-confirm"
              className="form-control"
              type="password"
              placeholder="Nhập lại mật khẩu"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              onInvalid={(e) => setError("Vui lòng xác nhận mật khẩu")}
              onInput={(e) => setError("")}
            />
          </div>

          {/* Thông báo lỗi */}
          {error && (
            <div className="login-error">
              <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          {/* Thông báo thành công */}
          {success && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(34, 197, 94, 0.08)',
              border: '1px solid rgba(34, 197, 94, 0.25)',
              color: '#16a34a',
              borderRadius: '6px',
              padding: '11px 14px',
              fontSize: '14px',
              marginBottom: '12px',
            }}>
              <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {success}
            </div>
          )}

          {/* Nút đăng ký */}
          <button
            id="register-submit"
            type="submit"
            className="btn btn-primary btn-full"
            style={{ marginTop: '8px', padding: '12px 20px', fontSize: '15px' }}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="btn-spinner" />
                Đang đăng ký...
              </>
            ) : (
              'Đăng ký tài khoản'
            )}
          </button>
        </form>

        {/* Link về trang đăng nhập */}
        <p style={{
          textAlign: 'center',
          marginTop: '20px',
          fontSize: '14px',
          color: 'var(--text-secondary, #555)',
        }}>
          Đã có tài khoản?{' '}
          <Link
            to="/login"
            style={{
              color: 'var(--accent, #f97316)',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Đăng nhập ngay
          </Link>
        </p>
      </div>
    </div>
  );
}
