import React, { createContext, useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import api, { BACKEND_URL } from '../utils/axios';

export const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasFetched, setHasFetched] = useState(false);

  // Hàm fetch toàn bộ dữ liệu (user, rooms, cameras) - chỉ chạy 1 lần khi load app hoặc đăng nhập
  const fetchData = useCallback(async (force = false) => {
    if (hasFetched && !force) {
      return;
    }
    setLoading(true);
    try {
      // 1. Fetch user thông tin
      const userRes = await api.get('/users');
      setUser(userRes.data);

      // 2. Fetch rooms và cameras song song
      const [roomsRes, camerasRes] = await Promise.all([
        api.get('/rooms'),
        api.get('/cameras'),
      ]);
      setRooms(roomsRes.data || []);
      setCameras(camerasRes.data || []);
      setHasFetched(true);
    } catch (error) {
      console.error('[AppContext] Error fetching initial data:', error);
      setUser(null);
      setRooms([]);
      setCameras([]);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [hasFetched]);

  // Hàm refresh data cho các trang quản lý hoặc khi có thay đổi (chỉ load lại rooms/cameras)
  const refreshData = useCallback(async () => {
    try {
      const [roomsRes, camerasRes] = await Promise.all([
        api.get('/rooms'),
        api.get('/cameras'),
      ]);
      setRooms(roomsRes.data || []);
      setCameras(camerasRes.data || []);
    } catch (error) {
      console.error('[AppContext] Error refreshing data:', error);
    }
  }, []);

  // Hàm reset context khi đăng xuất
  const resetContext = useCallback(() => {
    setUser(null);
    setRooms([]);
    setCameras([]);
    setHasFetched(false);
  }, []);

  // Khởi tạo kết nối socket.io 1 lần duy nhất
  useEffect(() => {
    const socketInstance = io(BACKEND_URL, {
      withCredentials: true,
      autoConnect: true,
    });
    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      console.log('[AppContext] Socket connected:', socketInstance.id);
    });

    return () => {
      console.log('[AppContext] Disconnecting socket...');
      socketInstance.disconnect();
    };
  }, []);

  // Tự động kết nối lại socket khi user thay đổi (đăng nhập / đăng xuất) để cập nhật handshake cookie
  useEffect(() => {
    if (socket && user?.id) {
      socket.disconnect();
      socket.connect();
    }
  }, [user?.id]);

  return (
    <AppContext.Provider
      value={{
        user,
        setUser,
        rooms,
        setRooms,
        cameras,
        setCameras,
        socket,
        loading,
        hasFetched,
        fetchData,
        refreshData,
        resetContext,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
