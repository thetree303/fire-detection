import { useEffect, useState, useCallback } from 'react';
import api, { BACKEND_URL } from '../utils/axios';

// ─────────────────────────────────────────────
// Định dạng ngày giờ tiếng Việt
// ─────────────────────────────────────────────
function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// ─────────────────────────────────────────────
// DeletedMediaPlaceholder
// Hiển thị khi imageFilename & videoFilename đều null
// ─────────────────────────────────────────────
const DeletedMediaPlaceholder = () => (
  <div className="deleted-media-placeholder-sm" style={{
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '6px 8px',
    borderRadius: '4px',
    background: 'rgba(113, 113, 122, 0.08)',
    border: '1px dashed rgba(113, 113, 122, 0.35)',
    width: '60px',
    height: '45px',
    textAlign: 'center',
    flexShrink: 0,
  }}>
    {/* Icon thùng rác nhỏ */}
    <svg
      style={{ width: '14px', height: '14px', color: '#71717a', opacity: 0.75 }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  </div>
);

// ─────────────────────────────────────────────
// ImageThumb
// ─────────────────────────────────────────────
const ImageThumb = ({ src, alt }) => {
  const [open, setOpen] = useState(false);

  if (!src) return <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>;

  return (
    <>
      <img
        src={src}
        alt={alt || 'snapshot'}
        loading="lazy"
        onClick={() => setOpen(true)}
        style={{
          width: '60px',
          height: '45px',
          objectFit: 'cover',
          borderRadius: '4px',
          border: '1px solid var(--border)',
          cursor: 'zoom-in',
          flexShrink: 0,
        }}
      />
      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setOpen(false)}
        >
          <img
            src={src}
            alt={alt}
            style={{
              maxWidth: '90vw',
              maxHeight: '85vh',
              borderRadius: '10px',
              boxShadow: '0 16px 60px rgba(0, 0, 0, 0.6)',
              objectFit: 'contain',
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            style={{
              position: 'absolute',
              top: '20px',
              right: '24px',
              background: 'rgba(255, 255, 255, 0.12)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              color: '#fff',
              fontSize: '18px',
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
};

// ─────────────────────────────────────────────
// CameraAlertsList
// ─────────────────────────────────────────────
const CameraAlertsList = ({ cameraId, alertHistory = [] }) => {
  const [alerts, setAlerts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [resolvingId, setResolvingId] = useState(null);

  const fetchAlerts = useCallback(async (pageNum, isLoadMore = false) => {
    if (!cameraId) return;
    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const res = await api.get(`/alerts/camera/${cameraId}`, {
        params: { page: pageNum, limit: 10 }
      });
      const data = res.data.data || [];
      const hasNext = res.data.paging?.hasNextPage || false;
      const count = res.data.unresolvedCount || 0;

      if (isLoadMore) {
        setAlerts((prev) => [...prev, ...data]);
      } else {
        setAlerts(data);
      }
      setHasNextPage(hasNext);
      setUnresolvedCount(count);
    } catch (err) {
      console.error('Lỗi khi tải cảnh báo của camera:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [cameraId]);

  // Tự động tải lại khi cameraId thay đổi hoặc có cảnh báo mới qua websocket
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        setPage(1);
        setAlerts([]);
        fetchAlerts(1, false);
      }
    });
    return () => {
      active = false;
    };
  }, [cameraId, fetchAlerts, alertHistory]);

  const handleLoadMore = () => {
    const nextPageNum = page + 1;
    setPage(nextPageNum);
    fetchAlerts(nextPageNum, true);
  };

  const handleResolve = async (alertId) => {
    setResolvingId(alertId);
    try {
      await api.put(`/alerts/handle/${alertId}`);
      setAlerts((prev) =>
        prev.map((a) => a.id === alertId ? { ...a, isResolved: true, is_resolved: true } : a)
      );
      setUnresolvedCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Lỗi khi xử lý cảnh báo:', err);
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="camera-alerts-container" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Cảnh báo gần đây
        </span>
        {unresolvedCount > 0 && (
          <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '100px', background: 'var(--red)', color: 'white' }}>
            {unresolvedCount} chưa xử lý
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '14px' }}>
          Đang tải dữ liệu...
        </div>
      ) : alerts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)', fontSize: '14px', background: 'var(--bg-card)', borderRadius: '6px', border: '1px solid var(--border)' }}>
          Chưa có cảnh báo nào của camera này
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {alerts.map((alert) => {
            const resolved = alert.isResolved || alert.is_resolved;
            const ts = alert.detectedAt || alert.detected_at;
            const imageUrl = alert.image_url
              ? alert.image_url
              : alert.imageFilename
                ? `${BACKEND_URL}/images/${alert.imageFilename}`
                : null;

            return (
              <div
                key={alert.id}
                style={{
                  background: resolved ? 'var(--green-dim)' : 'var(--red-dim)',
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: '1px solid var(--border)',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  opacity: resolved ? 0.85 : 1,
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {alert.imageFilename ? (
                    <ImageThumb src={imageUrl} alt={`Alert ${alert.id}`} />
                  ) : (
                    <DeletedMediaPlaceholder />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                      {formatDate(ts)}
                    </div>
                  </div>
                </div>

                {!resolved && (
                  <button
                    style={{
                      width: '100%',
                      background: 'var(--red)',
                      color: 'white',
                      borderRadius: '20px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                    }}
                    disabled={resolvingId === alert.id}
                    onClick={() => handleResolve(alert.id)}
                  >
                    {resolvingId === alert.id ? 'Đang xử lý...' : 'Xác nhận an toàn'}
                  </button>
                )}
              </div>
            );
          })}

          {hasNextPage && (
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                textAlign: 'center',
                marginTop: '4px',
                transition: 'all 0.15s',
              }}
            >
              {loadingMore ? 'Đang tải...' : 'Tải thêm...'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default CameraAlertsList;
