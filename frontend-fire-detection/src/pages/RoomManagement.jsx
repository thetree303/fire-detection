import { useEffect, useState, useContext } from "react";
import api from "../utils/axios";
import { AppContext } from "../context/AppContext";

const RoomManagement = () => {
  const { rooms, refreshData } = useContext(AppContext);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Edit state
  const [editingRoom, setEditingRoom] = useState(null); // null = add mode, object = edit mode

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchRooms = () => {
    refreshData();
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const resetForm = () => {
    setName("");
    setDescription("");
    setEditingRoom(null);
  };

  const handleEditClick = (room) => {
    setEditingRoom(room);
    setName(room.name);
    setDescription(room.description || "");
    // Scroll form into view
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteClick = async (room) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa phòng "${room.name}"?`)) return;
    try {
      await api.delete(`/rooms/${room.id}`);
      fetchRooms();
      showToast("Xóa phòng thành công!");
      // If we were editing this room, reset form
      if (editingRoom?.id === room.id) resetForm();
    } catch {
      showToast("Lỗi khi xóa phòng", "error");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      if (editingRoom) {
        // UPDATE mode
        await api.put(`/rooms/${editingRoom.id}`, {
          name: name.trim(),
          description: description.trim(),
        });
        showToast("Cập nhật phòng thành công!");
      } else {
        // CREATE mode
        await api.post(`/rooms`, {
          name: name.trim(),
          description: description.trim(),
        });
        showToast("Tạo phòng thành công!");
      }
      resetForm();
      fetchRooms();
    } catch {
      showToast(editingRoom ? "Lỗi khi cập nhật phòng" : "Lỗi khi tạo phòng", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-title">Quản lý Phòng</div>
        <div className="page-description">
          Thêm mới và quản lý các phòng hiện có, thuận tiện theo dõi
        </div>
      </div>

      <div className="management-grid">
        {/* ── Room List ── */}
        <div className="card">
          <div className="card-header">
            <h3>Danh sách phòng ({rooms.length})</h3>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {rooms.length === 0 ? (
              <div className="empty-state" style={{ padding: "40px" }}>
                Chưa có phòng nào được tạo
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>STT</th>
                      <th>Tên phòng</th>
                      <th>Mô tả</th>
                      <th style={{ textAlign: "center" }}>Số camera</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((room, idx) => (
                      <tr key={room.id} className={editingRoom?.id === room.id ? "row-editing" : ""}>
                        <td style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                          {idx + 1}
                        </td>
                        <td style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                          {room.name}
                        </td>
                        <td style={{ fontSize: "13px" }}>
                          {room.description || "—"}
                        </td>
                        <td style={{ fontWeight: 500, color: "var(--text-primary)", textAlign: "center" }}>
                          {room.cameras?.length ?? 0}
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              className="btn-action btn-action-edit"
                              onClick={() => handleEditClick(room)}
                              title="Sửa phòng"
                            >
                              Sửa
                            </button>
                            <button
                              className="btn-action btn-action-delete"
                              onClick={() => handleDeleteClick(room)}
                              title="Xóa phòng"
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
            <h3>{editingRoom ? "Sửa thông tin phòng" : "Thêm phòng mới"}</h3>
            {editingRoom && (
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                Đang sửa: <strong style={{ color: "var(--accent)" }}>{editingRoom.name}</strong>
              </div>
            )}
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Tên phòng *</label>
                <input
                  className="form-control"
                  type="text"
                  placeholder="VD: Tầng 1 - Hành lang A"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  onInvalid={(e) => e.target.setCustomValidity("Vui lòng nhập tên phòng")}
                  onInput={(e) => e.target.setCustomValidity("")}
                />
              </div>
              <div className="form-group">
                <label>Mô tả</label>
                <textarea
                  className="form-control"
                  placeholder="Mô tả vị trí, khu vực..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  style={{ resize: "vertical" }}
                />
              </div>

              <div className="action-btn-group">
                <button
                  type="submit"
                  className="btn btn-primary btn-full"
                  disabled={loading}
                >
                  {loading
                    ? editingRoom ? "Đang lưu..." : "Đang tạo..."
                    : editingRoom ? "Lưu thay đổi" : "Tạo phòng"}
                </button>
                {editingRoom && (
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

      {toast && <div className={`toast toast-${toast.type}`}>{toast.type === "error" ? "❌" : "✅"} {toast.msg}</div>}
    </div>
  );
};

export default RoomManagement;
