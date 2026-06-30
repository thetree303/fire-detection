import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../utils/axios';

export default function LoginPage() {
  const navigate = useNavigate();
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identity.trim() || !password.trim()) return;
    setLoading(true);
    setError('');
    try {
      // Backend sẽ tự đặt httpOnly cookie 'access_token' vào response
      await api.post('/auth/login', { identity, password });
      navigate('/', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.message || 'Có lỗi xảy ra! Không thể đăng nhập.';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Fire Detector</h1>
        <p className="login-subtitle">Hệ thống giám sát phát hiện cháy</p>

        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="form-group">
            <label>Tên đăng nhập / Email</label>
            <input
              id="login-identity"
              className="form-control"
              type="text"
              placeholder="VD: admin hoặc admin@example.com"
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              autoFocus
              required
              onInvalid={(e) => e.target.setCustomValidity("Vui lòng nhập tên đăng nhập hoặc email")}
              onInput={(e) => e.target.setCustomValidity("")}
            />
          </div>

          <div className="form-group">
            <label>Mật khẩu</label>
            <input
              id="login-password"
              className="form-control"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              onInvalid={(e) => e.target.setCustomValidity("Vui lòng nhập mật khẩu")}
              onInput={(e) => e.target.setCustomValidity("")}
            />
          </div>

          {error && (
            <div className="login-error">
              <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          <button
            id="login-submit"
            type="submit"
            className="btn btn-primary btn-full"
            style={{ marginTop: '8px', padding: '12px 20px', fontSize: '15px' }}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="btn-spinner" />
                Đang đăng nhập...
              </>
            ) : (
              'Đăng nhập'
            )}
          </button>
        </form>

        {/* Link sang trang đăng ký */}
        <p style={{
          textAlign: 'center',
          marginTop: '20px',
          fontSize: '14px',
          color: 'var(--text-secondary, #555)',
        }}>
          Chưa có tài khoản?{' '}
          <Link
            to="/register"
            style={{
              color: 'var(--accent, #f97316)',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Đăng ký ngay
          </Link>
        </p>
      </div>
    </div>
  );
}
