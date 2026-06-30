import axios from 'axios';

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 15000,
  // Tự động đính kèm cookie (access_token httpOnly) vào mọi request
  withCredentials: true,
});

// RESPONSE INTERCEPTOR: Nếu 401 → redirect về trang login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Chỉ redirect về login nếu lỗi 401 và KHÔNG PHẢI đang ở endpoint login
    if (error.response?.status === 401 && !error.config.url.includes('/auth/login')) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default api;
