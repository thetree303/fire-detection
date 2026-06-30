import { useEffect, useState, useCallback, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import api, { BACKEND_URL } from '../utils/axios';
import './css/AlertHistory.css';

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
// Hiển thị khi cả imageFilename lẫn videoFilename đều null
// (hệ thống đã dọn dẹp tự động)
// ─────────────────────────────────────────────
const DeletedMediaPlaceholder = () => (
  <div className="deleted-media-placeholder" title="Dữ liệu không tồn tại">
    <span className="deleted-media-text">
      Dữ liệu không tồn tại hoặc đã được dọn dẹp
    </span>
  </div>
);

// ─────────────────────────────────────────────
// ImageThumb — thumbnail nhỏ, click để xem to
// ─────────────────────────────────────────────
const ImageThumb = ({ src, alt }) => {
  const [open, setOpen] = useState(false);

  if (!src) return <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>—</span>;

  return (
    <>
      <img
        className="ah-thumb"
        src={src}
        alt={alt || 'snapshot'}
        loading="lazy"
        onClick={() => setOpen(true)}
        title="Nhấp để xem ảnh lớn"
      />
      {open && (
        <div className="ah-lightbox" onClick={() => setOpen(false)}>
          <img src={src} alt={alt} className="ah-lightbox-img" onClick={(e) => e.stopPropagation()} />
          <button className="ah-lightbox-close" onClick={() => setOpen(false)}>✕</button>
        </div>
      )}
    </>
  );
};

// ─────────────────────────────────────────────
// MediaThumb — ưu tiên video, fallback sang ảnh,
// fallback sang DeletedMediaPlaceholder nếu cả 2 đều null
// ─────────────────────────────────────────────
const MediaThumb = ({ videoUrl, isMediaDeleted }) => {
  const [open, setOpen] = useState(false);

  // Trường hợp 1: Cả hai đều null và được đánh dấu là đã xóa
  if (isMediaDeleted) {
    return <DeletedMediaPlaceholder />;
  }

  // Trường hợp 2: Chưa có media (alert từ cảm biến, không có AI)
  if (!videoUrl) {
    return <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>—</span>;
  }

  return (
    <>
      {/* Thumbnail hiển thị trong bảng */}
      <div
        className="ah-video-thumb-wrap"
        onClick={() => setOpen(true)}
        title="Nhấp để xem video"
      >
        <video
          className="ah-thumb"
          src={videoUrl}
          preload="metadata"
          playsInline
          muted
          style={{ cursor: 'pointer' }}
        />
        {/* Nút play overlay */}
        <span className="ah-play-icon">▶</span>
      </div>

      {/* Lightbox/modal khi click */}
      {open && (
        <div className="ah-lightbox" onClick={() => setOpen(false)}>
          <video
            className="ah-lightbox-video"
            src={videoUrl}
            controls
            playsInline
            autoPlay={false}
            onClick={(e) => e.stopPropagation()}
          />
          <button className="ah-lightbox-close" onClick={() => setOpen(false)}>✕</button>
        </div>
      )}
    </>
  );
};

// ─────────────────────────────────────────────
// AlertHistory — trang lịch sử cảnh báo toàn cục
// ─────────────────────────────────────────────
const AlertHistory = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState(null);
  const [isBulkResolving, setIsBulkResolving] = useState(false);
  const [toast, setToast] = useState(null);

  // States cho phân trang & bộ lọc
  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  // Input fields states
  const [roomIdInput, setRoomIdInput] = useState('');
  const [cameraIdInput, setCameraIdInput] = useState('');
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');

  // Active query parameters states
  const [filterCameraId, setFilterCameraId] = useState('');
  const [filterRoomId, setFilterRoomId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Meta states
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const { rooms, cameras } = useContext(AppContext);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Fetch toàn bộ lịch sử ─────────────────
  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit,
        ...(filterCameraId ? { cameraId: filterCameraId } : {}),
        ...(filterRoomId ? { roomId: filterRoomId } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
      };
      const res = await api.get('/alerts', { params });
      setAlerts(res.data.data || []);
      setTotalPages(res.data.meta?.totalPages || 1);
      setTotalItems(res.data.meta?.totalItems || 0);
      setUnresolvedCount(res.data.unresolvedCount || 0);
    } catch {
      showToast('Không thể tải lịch sử cảnh báo', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, limit, filterCameraId, filterRoomId, startDate, endDate]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) fetchAlerts();
    });
    return () => {
      active = false;
    };
  }, [fetchAlerts]);

  // ── Xác nhận an toàn ──────────────────────
  const handleResolve = async (alertId) => {
    setResolvingId(alertId);
    try {
      await api.put(`/alerts/handle/${alertId}`);
      setAlerts((prev) =>
        prev.map((a) => a.id === alertId ? { ...a, isResolved: true, is_resolved: true } : a),
      );
      setUnresolvedCount((prev) => Math.max(0, prev - 1));
      showToast('Đã xác nhận an toàn!');
    } catch {
      showToast('Lỗi khi xác nhận', 'error');
    } finally {
      setResolvingId(null);
    }
  };

  // ── Xác nhận an toàn tất cả ─────────────────
  const handleBulkResolve = async () => {
    if (!window.confirm(`Hãy kiểm tra thật kỹ trước khi xác nhận an toàn cho tất cả. Bạn muốn xác nhận an toàn cho toàn bộ ${unresolvedCount} cảnh báo chưa xử lý?`)) return;

    setIsBulkResolving(true);
    try {
      const res = await api.put('/alerts/handle-all');
      setAlerts((prev) =>
        prev.map((a) => ({ ...a, isResolved: true, is_resolved: true })),
      );
      setUnresolvedCount(0);
      showToast(res.data.message || `Đã xác nhận an toàn thành công!`);
    } catch {
      showToast('Lỗi khi xác nhận an toàn toàn bộ', 'error');
    } finally {
      setIsBulkResolving(false);
    }
  };

  const handleApplyFilter = () => {
    setPage(1);
    setFilterCameraId(cameraIdInput);
    setFilterRoomId(roomIdInput);
    setStartDate(startDateInput);
    setEndDate(endDateInput);
  };

  const handleClearFilter = () => {
    setRoomIdInput('');
    setCameraIdInput('');
    setStartDateInput('');
    setEndDateInput('');
    setFilterCameraId('');
    setFilterRoomId('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          Lịch sử Cảnh báo
          {unresolvedCount > 0 && (
            <span className="ah-unresolved-badge">{unresolvedCount} chờ xử lý</span>
          )}
        </div>
        <div className="page-description">
          Toàn bộ lịch sử phát hiện cháy từ tất cả camera trong hệ thống
        </div>
      </div>

      {/* Thanh Bộ lọc */}
      <div className="ah-filter-bar" style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        gap: '16px',
        padding: '20px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        marginBottom: '20px',
      }}>
        <div className="ah-filter-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '150px' }}>
          <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>Phòng</label>
          <select
            className="form-control"
            value={roomIdInput}
            onChange={(e) => setRoomIdInput(e.target.value)}
            style={{ width: '100%', height: '38px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', padding: '0 12px' }}
          >
            <option value="">-- Tất cả Phòng --</option>
            {rooms.map(room => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </div>

        <div className="ah-filter-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '150px' }}>
          <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>Camera</label>
          <select
            className="form-control"
            value={cameraIdInput}
            onChange={(e) => setCameraIdInput(e.target.value)}
            style={{ width: '100%', height: '38px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', padding: '0 12px' }}
          >
            <option value="">-- Tất cả Camera --</option>
            {cameras.map(cam => (
              <option key={cam.id} value={cam.id}>
                {cam.name}
              </option>
            ))}
          </select>
        </div>

        <div className="ah-filter-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '150px' }}>
          <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>Từ ngày</label>
          <input
            type="date"
            className="form-control"
            value={startDateInput}
            onChange={(e) => setStartDateInput(e.target.value)}
            style={{ width: '100%', height: '38px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', padding: '0 12px' }}
          />
        </div>

        <div className="ah-filter-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '150px' }}>
          <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>Đến ngày</label>
          <input
            type="date"
            className="form-control"
            value={endDateInput}
            onChange={(e) => setEndDateInput(e.target.value)}
            style={{ width: '100%', height: '38px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', padding: '0 12px' }}
          />
        </div>

        <div className="ah-filter-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={handleApplyFilter}
            style={{ height: '38px', padding: '0 20px', borderRadius: '100px', fontSize: '14px', fontWeight: '600' }}
          >
            Lọc
          </button>
          <button
            className="btn"
            onClick={handleClearFilter}
            style={{
              height: '38px',
              padding: '0 20px',
              borderRadius: '100px',
              fontSize: '14px',
              fontWeight: '600',
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-light)'
            }}
          >
            Xóa lọc
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header ah-card-header">
          <h3>Danh sách cảnh báo ({totalItems})</h3>
          <div style={{ display: 'flex', gap: '12px' }}>
            {unresolvedCount > 0 && (
              <button
                className="btn ah-bulk-resolve-btn"
                onClick={handleBulkResolve}
                disabled={isBulkResolving || loading}
              >
                {isBulkResolving ? (
                  <><span className="ah-btn-spinner" /> Đang xử lý...</>
                ) : (
                  <>

                    Xác nhận tất cả
                  </>
                )}
              </button>
            )}
            <button
              className="btn btn-primary"
              style={{ padding: '8px 16px', fontSize: '14px' }}
              onClick={fetchAlerts}
              disabled={loading}
            >
              {loading ? (
                <span className="ah-btn-spinner" />
              ) : (
                <>
                  Làm mới
                </>
              )}
            </button>
          </div>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="ah-loading-state">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="ah-skeleton-row">
                  <div className="ah-skeleton-cell wide" />
                  <div className="ah-skeleton-cell" />
                  <div className="ah-skeleton-cell thumb" />
                  <div className="ah-skeleton-cell narrow" />
                  <div className="ah-skeleton-cell narrow" />
                </div>
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <div className="empty-state" style={{ padding: '60px 20px' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ opacity: 0.3, marginBottom: '12px' }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <p>Chưa có cảnh báo nào được ghi nhận</p>
            </div>
          ) : (
            <>
              <div className="table-wrapper">
                <table className="data-table ah-table">
                  <thead>
                    <tr>
                      <th>Thời gian</th>
                      <th>Camera / Phòng</th>
                      <th style={{ textAlign: 'center' }}>Ảnh</th>
                      <th style={{ textAlign: 'center' }}>Video</th>
                      <th style={{ textAlign: 'center' }}>Trạng thái</th>
                      <th style={{ textAlign: 'center' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((alert) => {
                      const resolved = alert.isResolved || alert.is_resolved;
                      const ts = alert.detectedAt || alert.detected_at;

                      const imageUrl = alert.image_url
                        ? alert.image_url
                        : alert.imageFilename
                          ? `${BACKEND_URL}/images/${alert.imageFilename}`
                          : null;
                      const videoUrl = alert.videoFilename
                        ? `${BACKEND_URL}/videos/${alert.videoFilename}`
                        : null;


                      const camName = alert.camera?.name || `Camera #${alert.camera_id || alert.cameraId || '?'}`;
                      const roomName = alert.camera?.room?.name || null;

                      return (
                        <tr
                          key={alert.id}
                          className={resolved ? '' : 'ah-row-unresolved'}
                          id={`alert-row-${alert.id}`}
                        >
                          {/* Thời gian */}
                          <td className="ah-td-time">
                            <span className="ah-time-primary">{formatDate(ts).split(',')[1]?.trim() || formatDate(ts)}</span>
                          </td>

                          {/* Camera / Phòng */}
                          <td>
                            <div className="ah-cam-cell">
                              <div>
                                <div className="ah-cam-name">{camName}</div>
                                {roomName && <div className="ah-room-name">{roomName}</div>}
                              </div>
                            </div>
                          </td>

                          {/* Ảnh (chụp khi phát cảnh báo) */}
                          <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                            {alert.imageFilename ? (
                              <ImageThumb
                                src={imageUrl}
                                alt={`Snapshot @ ${camName}`}
                              />
                            ) : (
                              <div style={{
                                display: 'inline-flex', flexDirection: 'column',
                                alignItems: 'center', gap: '4px',
                                padding: '6px 10px', borderRadius: '6px',
                                background: 'rgba(113,113,122,0.08)',
                                border: '1px dashed rgba(113,113,122,0.35)',
                                fontSize: '11px', color: '#71717a', fontStyle: 'italic',
                                minWidth: '80px',
                              }}>
                                <DeletedMediaPlaceholder />
                              </div>
                            )}
                          </td>

                          {/* Video (ghi lại khi AI phát hiện cháy) */}
                          <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                            {alert.videoFilename ? (
                              <MediaThumb
                                videoUrl={videoUrl}
                                isMediaDeleted={alert.isMediaDeleted}
                                alt={`Video clip @ ${camName}`}
                              />
                            ) : (
                              <div style={{
                                display: 'inline-flex', flexDirection: 'column',
                                alignItems: 'center', gap: '4px',
                                padding: '6px 10px', borderRadius: '6px',
                                background: 'rgba(113,113,122,0.08)',
                                border: '1px dashed rgba(113,113,122,0.35)',
                                fontSize: '11px', color: '#71717a', fontStyle: 'italic',
                                minWidth: '80px',
                              }}>
                                <DeletedMediaPlaceholder />
                              </div>
                            )}
                          </td>

                          {/* Trạng thái */}
                          <td style={{ textAlign: 'center' }}>
                            <span className={`ah-status-badge ${resolved ? 'resolved' : 'unresolved'}`}>
                              {resolved ? 'Đã xử lý' : 'Chưa xử lý'}
                            </span>
                          </td>

                          {/* Thao tác */}
                          <td style={{ textAlign: 'center' }}>
                            {resolved ? (
                              <span className="ah-done-tag">
                                <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                An toàn
                              </span>
                            ) : (
                              <button
                                id={`ah-resolve-btn-${alert.id}`}
                                className="ah-resolve-btn"
                                disabled={resolvingId === alert.id}
                                onClick={() => handleResolve(alert.id)}
                              >
                                {resolvingId === alert.id ? (
                                  <><span className="ah-btn-spinner" /> Đang xử lý...</>
                                ) : (
                                  'Xác nhận an toàn'
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Phân trang */}
              {totalPages > 1 && (
                <div className="ah-pagination" style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 24px',
                  borderTop: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-surface)',
                }}>
                  <span className="ah-pagination-info" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    Hiển thị {(page - 1) * limit + 1} - {Math.min(page * limit, totalItems)} trong tổng số {totalItems} cảnh báo
                  </span>
                  <div className="ah-pagination-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                      className="btn"
                      disabled={page <= 1}
                      onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                      style={{
                        height: '34px',
                        padding: '0 16px',
                        borderRadius: '100px',
                        fontSize: '13px',
                        fontWeight: '600',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-light)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      Trang trước
                    </button>
                    <span className="ah-page-text" style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                      Trang {page} / {totalPages}
                    </span>
                    <button
                      className="btn"
                      disabled={page >= totalPages}
                      onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                      style={{
                        height: '34px',
                        padding: '0 16px',
                        borderRadius: '100px',
                        fontSize: '13px',
                        fontWeight: '600',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-light)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      Trang sau
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Toast notification */}
      {
        toast && (
          <div className={`toast toast-${toast.type}`}>
            {toast.msg}
          </div>
        )
      }
    </div >
  );
};

export default AlertHistory;
