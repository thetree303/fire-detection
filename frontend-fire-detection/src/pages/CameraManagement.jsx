import React, { useEffect, useState, useContext } from 'react';
import api from '../utils/axios';
import { AppContext } from '../context/AppContext';

const CameraManagement = () => {
  const { cameras, rooms, refreshData } = useContext(AppContext);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Edit state
  const [editingCamera, setEditingCamera] = useState(null); // null = add mode

  // Form fields (shared for create & edit)
  const [macAddress, setMacAddress] = useState('');
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [description, setDescription] = useState('');

  // Threshold config fields (edit only)
  const [maxTemperature, setMaxTemperature] = useState('');
  const [maxGasPercent, setMaxGasPercent] = useState('');
  const [smokeTriggerValue, setSmokeTriggerValue] = useState('');
  const [flameTriggerValue, setFlameTriggerValue] = useState('');
  const [yoloConfidence, setYoloConfidence] = useState('');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchAll = () => {
    refreshData();
  };

  useEffect(() => { fetchAll(); }, []);

  const resetForm = () => {
    setEditingCamera(null);
    setMacAddress('');
    setName('');
    setRoomId('');
    setDescription('');
    setMaxTemperature('');
    setMaxGasPercent('');
    setSmokeTriggerValue('');
    setFlameTriggerValue('');
    setYoloConfidence('');
  };

  const handleEditClick = (cam) => {
    setEditingCamera(cam);
    setMacAddress(cam.macAddress || '');
    setName(cam.name || '');
    setRoomId(cam.room?.id ?? cam.room_id ?? cam.roomId ?? '');
    setDescription(cam.description || '');
    setMaxTemperature(cam.maxTemperature != null ? String(cam.maxTemperature) : '');
    setMaxGasPercent(cam.maxGasPercent != null ? String(cam.maxGasPercent) : '');
    // smokeTrigger và flameTrigger từ backend là boolean → map về "true"/"false" cho select
    setSmokeTriggerValue(cam.smokeTrigger != null ? String(cam.smokeTrigger) : '');
    setFlameTriggerValue(cam.flameTrigger != null ? String(cam.flameTrigger) : '');
    setYoloConfidence(cam.yoloConfidence != null ? String(cam.yoloConfidence) : '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteClick = async (cam) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa camera "${cam.name}"?`)) return;
    try {
      await api.delete(`/cameras/${cam.id}`);
      fetchAll();
      showToast('Xóa camera thành công!');
      if (editingCamera?.id === cam.id) resetForm();
    } catch {
      showToast('Lỗi khi xóa camera', 'error');
    }
  };

  // ── Create Camera ───────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();

    const payload = {
      macAddress: macAddress.trim().toUpperCase(),
      name: name.trim(),
      roomId: Number(roomId),
      description: description.trim() || undefined,
    };

    if (!payload.macAddress || !payload.name || isNaN(payload.roomId)) {
      showToast("Vui lòng nhập đầy đủ thông tin bắt buộc", "error");
      return;
    }

    setLoading(true);
    try {
      await api.post('/cameras', payload);
      showToast('Đăng ký camera thành công!');
      resetForm();
      fetchAll();
    } catch (err) {
      console.error("Lỗi chi tiết:", err.response || err);
      showToast(err.response?.data?.message || 'Lỗi khi đăng ký camera', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Update Camera ───────────────────────────────────────
  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);

    const parseNum = (val) => {
      if (val === '' || val == null) return null;
      const n = Number(val);
      return isNaN(n) ? null : n;
    };

    const payload = {};
    if (name.trim()) payload.name = name.trim();
    if (description.trim()) payload.description = description.trim();
    if (roomId !== '') payload.roomId = Number(roomId);

    const mt = parseNum(maxTemperature);
    const mg = parseNum(maxGasPercent);
    const yc = parseNum(yoloConfidence);

    if (mt !== null) payload.maxTemperature = mt;
    if (mg !== null) payload.maxGasPercent = mg;
    if (yc !== null) payload.yoloConfidence = yc;

    // smokeTrigger & flameTrigger: select trả về string "true"/"false" → cast sang boolean
    if (smokeTriggerValue !== '') payload.smokeTrigger = smokeTriggerValue === 'true';
    if (flameTriggerValue !== '') payload.flameTrigger = flameTriggerValue === 'true';

    try {
      await api.put(`/cameras/${editingCamera.id}`, payload);
      showToast('Cập nhật camera thành công!');
      resetForm();
      fetchAll();
    } catch (err) {
      console.error("Lỗi cập nhật:", err.response || err);
      showToast('Lỗi khi cập nhật camera', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getRoomName = (cam) => {
    if (cam.room?.name) return cam.room.name;
    const r = rooms.find((r) => r.id === cam.room_id);
    return r ? r.name : '—';
  };

  const statusBadge = (status) => {
    if (!status || status === 'not_binded')
      return <span className="badge badge-yellow">Chưa kết nối</span>;
    if (status === 'offline')
      return <span className="badge badge-red">Offline</span>;
    if (status === 'online')
      return <span className="badge badge-green">Online</span>;
    return <span className="badge badge-blue">{status}</span>;
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-title">
          Quản lý Camera
        </div>
        <div className="page-description">
          Thêm mới camera và quản lý các camera hiện có
        </div>
      </div>

      <div className="management-grid">
        {/* ── Camera List ── */}
        <div className="card">
          <div className="card-header">
            <h3>Danh sách camera ({cameras.length})</h3>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {cameras.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px' }}>
                Chưa có camera nào được đăng ký
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>STT</th>
                      <th>MAC Address</th>
                      <th>Tên</th>
                      <th>Phòng</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cameras.map((cam, idx) => (
                      <tr key={cam.id} className={editingCamera?.id === cam.id ? 'row-editing' : ''}>
                        <td style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                          {idx + 1}
                        </td>
                        <td>
                          <code style={{
                            fontSize: '14px',
                            borderRadius: '4px',
                            letterSpacing: '0.5px',
                            fontWeight: '500',
                          }}>
                            {cam.macAddress || '—'}
                          </code>
                        </td>
                        <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                          {cam.name}
                        </td>
                        <td style={{ fontSize: '13px' }}>{getRoomName(cam)}</td>
                        <td>{statusBadge(cam.status)}</td>
                        <td>
                          <div className="table-actions">
                            <button
                              className="btn-action btn-action-edit"
                              onClick={() => handleEditClick(cam)}
                              title="Sửa camera"
                            >
                              Sửa
                            </button>
                            <button
                              className="btn-action btn-action-delete"
                              onClick={() => handleDeleteClick(cam)}
                              title="Xóa camera"
                            >
                              Xóa
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Form Panel ── */}
        <div className="card">
          <div className="card-header">
            <h3>{editingCamera ? 'Sửa thông tin Camera' : 'Đăng ký Camera mới'}</h3>
            {editingCamera ? (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Đang sửa: <strong style={{ color: 'var(--accent)' }}>{editingCamera.name}</strong>
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Nhập chính xác địa chỉ MAC trên thiết bị camera, và các thông tin cơ bản. Hệ thống sẽ tự động quét và đồng bộ các thông tin còn lại.
              </div>
            )}
          </div>

          <div className="card-body">
            <form onSubmit={editingCamera ? handleUpdate : handleCreate}>

              {/* MAC Address */}
              <div className="form-group">
                <label htmlFor="reg-mac">Địa chỉ MAC *</label>
                <input
                  id="reg-mac"
                  className="form-control"
                  type="text"
                  placeholder="VD: AA:BB:CC:DD:EE:FF"
                  value={macAddress}
                  onChange={(e) => setMacAddress(e.target.value)}
                  required={!editingCamera}
                  disabled={!!editingCamera}
                  style={editingCamera ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                  onInvalid={(e) => e.target.setCustomValidity("Vui lòng nhập đúng địa chỉ MAC")}
                  onInput={(e) => e.target.setCustomValidity("")}
                />
                {editingCamera && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Địa chỉ camera không thể thay đổi sau khi đăng ký.
                  </div>
                )}
              </div>

              {/* Name */}
              <div className="form-group">
                <label htmlFor="reg-name">Tên camera *</label>
                <input
                  id="reg-name"
                  className="form-control"
                  type="text"
                  placeholder="VD: Camera Hành Lang A"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  onInvalid={(e) => e.target.setCustomValidity("Vui lòng nhập tên camera")}
                  onInput={(e) => e.target.setCustomValidity("")}
                />
              </div>

              {/* Room */}
              <div className="form-group">
                <label htmlFor="reg-room">Chọn Phòng</label>
                <select
                  id="reg-room"
                  className="form-control"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                >
                  <option value="">-- Chọn phòng --</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>{room.name}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="form-group">
                <label htmlFor="reg-desc">Mô tả</label>
                <textarea
                  id="reg-desc"
                  className="form-control"
                  placeholder="VD: Camera góc hành lang tầng 2"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  style={{ resize: "vertical" }}
                />
              </div>

              {/* Threshold config (edit mode only) */}
              {editingCamera && (() => {
                // Kiểm tra xem thiết bị đã từng kết nối chưa (có ít nhất 1 trường không phải null)
                const hasAnySensor =
                  editingCamera.yoloConfidence !== null ||
                  editingCamera.maxTemperature !== null ||
                  editingCamera.maxGasPercent !== null ||
                  editingCamera.smokeTrigger !== null ||
                  editingCamera.flameTrigger !== null;

                return (
                  <>
                    <div className="form-section-divider">
                      <span>Cấu hình ngưỡng cảnh báo</span>
                    </div>

                    {!hasAnySensor ? (
                      // Thông báo khi thiết bị chưa từng kết nối
                      <div style={{
                        background: 'rgba(234,179,8,0.08)',
                        border: '1px solid rgba(234,179,8,0.3)',
                        borderRadius: '8px',
                        padding: '14px 16px',
                        marginBottom: '16px',
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.7,
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'flex-start',
                      }}>
                        <span>
                          <strong style={{ color: 'rgba(234,179,8,0.9)', display: 'block', marginBottom: '2px' }}>
                            Thiết bị chưa từng kết nối
                          </strong>
                          Vui lòng bật nguồn thiết bị để hệ thống tự động nhận diện các cảm biến được hỗ trợ.
                        </span>
                      </div>
                    ) : (
                      <>
                        {/* AND Logic notice */}
                        <div style={{
                          background: 'rgba(249,115,22,0.08)',
                          borderRadius: '8px',
                          padding: '10px 14px',
                          marginBottom: '16px',
                          fontSize: '13px',
                          color: 'var(--text-secondary)',
                          lineHeight: 1.6,
                        }}>
                          <strong style={{ color: 'var(--accent)' }}></strong>{' '}
                          Các cảm biến được cấu hình{' '}
                          <strong>BẬT</strong> sẽ bắt buộc phải cùng phát hiện nguy hiểm thì mới kích
                          hoạt còi báo động. Đặt giá trị <strong>0</strong> (hoặc{' '}
                          <strong>Không đặt</strong>) để <strong>TẮT</strong> cảm biến đó.
                        </div>

                        {/* AI + Nhiệt độ */}
                        <div className="form-row-2">
                          {editingCamera.yoloConfidence !== null && (
                            <div className="form-group">
                              <label>Camera AI (Ngưỡng tin cậy)</label>
                              <input
                                id="threshold-yolo"
                                className="form-control"
                                type="number"
                                placeholder="VD: 0.5"
                                value={yoloConfidence}
                                onChange={(e) => setYoloConfidence(e.target.value)}
                                min="0"
                                max="1"
                                step="0.1"
                              />
                            </div>
                          )}
                          {editingCamera.maxTemperature !== null && (
                            <div className="form-group">
                              <label>Nhiệt độ tối đa (°C)</label>
                              <input
                                className="form-control"
                                type="number"
                                placeholder="VD: 60 · 0 = Tắt"
                                value={maxTemperature}
                                onChange={(e) => setMaxTemperature(e.target.value)}
                                min="0"
                                step="any"
                              />
                            </div>
                          )}
                        </div>

                        {/* Gas + Khói */}
                        <div className="form-row-2">
                          {editingCamera.maxGasPercent !== null && (
                            <div className="form-group">
                              <label>Khí gas tối đa (%)</label>
                              <input
                                className="form-control"
                                type="number"
                                placeholder="VD: 30 · 0 = Tắt"
                                value={maxGasPercent}
                                onChange={(e) => setMaxGasPercent(e.target.value)}
                                min="0"
                                max="100"
                                step="any"
                              />
                            </div>
                          )}
                          {editingCamera.smokeTrigger !== null && (
                            <div className="form-group">
                              <label>Cảm biến Khói</label>
                              <select
                                className="form-control"
                                value={smokeTriggerValue}
                                onChange={(e) => setSmokeTriggerValue(e.target.value)}
                              >
                                <option value="false">Tắt</option>
                                <option value="true">Bật</option>
                              </select>
                            </div>
                          )}
                        </div>

                        {/* Lửa */}
                        {editingCamera.flameTrigger !== null && (
                          <div className="form-row-2">
                            <div className="form-group">
                              <label>Cảm biến Lửa</label>
                              <select
                                className="form-control"
                                value={flameTriggerValue}
                                onChange={(e) => setFlameTriggerValue(e.target.value)}
                              >
                                <option value="false">Tắt</option>
                                <option value="true">Bật</option>
                              </select>
                            </div>
                            {/* Ô trống để giữ layout 2 cột */}
                            <div className="form-group" />
                          </div>
                        )}
                      </>
                    )}
                  </>
                );
              })()}

              <div className="action-btn-group">
                <button
                  id="reg-submit"
                  type="submit"
                  className="btn btn-primary btn-full"
                  disabled={loading}
                >
                  {loading
                    ? (editingCamera ? 'Đang lưu...' : 'Đang đăng ký...')
                    : (editingCamera ? 'Lưu thay đổi' : 'Đăng ký Camera')}
                </button>
                {editingCamera && (
                  <button
                    type="button"
                    className="btn btn-cancel btn-full"
                    onClick={resetForm}
                    disabled={loading}
                  >
                    Hủy
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>

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

export default CameraManagement;
