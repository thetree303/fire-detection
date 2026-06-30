import { initializeApp } from 'firebase/app';
import api from './axios';
import { getMessaging, getToken, onMessage, deleteToken } from 'firebase/messaging';

// ─────────────────────────────────────────────────────────────────────────────
// CẤU HÌNH FIREBASE
// Thay thế các giá trị placeholder bằng thông tin từ Firebase Console:
//   Project Settings → General → Your apps → Firebase SDK snippet → Config
// ─────────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'YOUR_API_KEY',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'YOUR_AUTH_DOMAIN',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'YOUR_PROJECT_ID',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'YOUR_STORAGE_BUCKET',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'YOUR_MESSAGING_SENDER_ID',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || 'YOUR_APP_ID',
};

// ─────────────────────────────────────────────────────────────────────────────
// VAPID KEY (Web Push Certificate)
// Lấy từ Firebase Console → Cloud Messaging → Web Push certificates → Key pair
// ─────────────────────────────────────────────────────────────────────────────
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || 'YOUR_VAPID_KEY';

// Key lưu token vào localStorage để tránh gọi API lặp lại giữa các lần navigate
const FCM_TOKEN_STORAGE_KEY = 'fcm_registered_token';

// Khởi tạo Firebase App (singleton)
const app = initializeApp(firebaseConfig);

// Lấy Messaging instance (chỉ khả dụng trong môi trường có Service Worker)
let messaging = null;
try {
  messaging = getMessaging(app);
} catch (error) {
  console.warn('[FCM] Firebase Messaging is not supported in this environment:', error);
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON: Đảm bảo Service Worker chỉ được đăng ký 1 lần duy nhất
// Tránh việc gọi register() lặp lại mỗi lần component re-render.
// ─────────────────────────────────────────────────────────────────────────────
let _swRegistrationPromise = null;

const getServiceWorkerRegistration = () => {
  if (!_swRegistrationPromise) {
    _swRegistrationPromise = navigator.serviceWorker
      .register('/firebase-messaging-sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[FCM] Service Worker registered:', reg.scope);
        return reg;
      })
      .catch((err) => {
        _swRegistrationPromise = null; // Reset để có thể thử lại
        throw err;
      });
  }
  return _swRegistrationPromise;
};

/**
 * Xin quyền hiển thị thông báo, lấy FCM Registration Token và so sánh
 * với token đã lưu trong localStorage để tránh gọi API lưu DB không cần thiết.
 *
 * @returns {Promise<{token: string, isNew: boolean}|null>}
 *   - token: FCM token hợp lệ
 *   - isNew: true nếu token mới/thay đổi → cần lưu vào DB
 *            false nếu token chưa đổi → KHÔNG cần gọi API
 */
export const requestForToken = async () => {
  if (!messaging) {
    console.warn('[FCM] Messaging not initialized. Skipping token request.');
    return null;
  }

  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    console.warn('[FCM] Browser does not support notifications or service workers.');
    return null;
  }

  try {
    // Bước 1: Xin quyền hiển thị thông báo
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[FCM] Notification permission denied by user.');
      return null;
    }

    // Bước 2: Lấy FCM registration token từ Firebase
    const swReg = await getServiceWorkerRegistration();
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });

    if (!token) {
      console.warn('[FCM] No registration token available.');
      return null;
    }

    // Bước 3: So sánh với token đã lưu trong localStorage
    const cachedToken = localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
    const isNew = token !== cachedToken;

    if (isNew) {
      // Lưu token mới vào localStorage để lần sau không phải gọi API lại
      localStorage.setItem(FCM_TOKEN_STORAGE_KEY, token);
      console.log('[FCM] New token obtained (will save to DB):', token.substring(0, 20) + '...');
    } else {
      console.log('[FCM] Token unchanged. No DB update needed.');
    }

    return { token, isNew };
  } catch (error) {
    console.error('[FCM] An error occurred while retrieving token:', error);
    return null;
  }
};

/**
 * Xóa FCM token khỏi Firebase và localStorage khi người dùng đăng xuất.
 * Cần gọi API backend để xóa token trong DB trước khi gọi hàm này.
 * @returns {Promise<void>}
 */
export const clearFcmToken = async () => {
  const token = localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
  if (token) {
    try {
      await api.delete('/users/fcm-token', { data: { token } });
      console.log('[FCM] Token deleted from backend DB successfully.');
    } catch (error) {
      console.warn('[FCM] Failed to delete token from backend DB:', error);
    }
  }

  localStorage.removeItem(FCM_TOKEN_STORAGE_KEY);

  if (!messaging) return;
  try {
    await deleteToken(messaging);
    console.log('[FCM] Token deleted from Firebase successfully.');
  } catch (error) {
    console.warn('[FCM] Failed to delete token from Firebase:', error);
  }
};

/**
 * Lắng nghe thông báo khi ứng dụng đang mở (Foreground).
 * Background messages được xử lý bởi firebase-messaging-sw.js.
 *
 * @param {Function} callback Hàm callback nhận payload thông báo
 * @returns {Function} Hàm unsubscribe để dọn dẹp listener khi component unmount
 */
export const onMessageListener = (callback) => {
  if (!messaging) {
    console.warn('[FCM] Messaging not initialized. Cannot listen for messages.');
    return () => {}; // Trả về no-op unsubscribe
  }

  // onMessage trả về hàm unsubscribe
  const unsubscribe = onMessage(messaging, (payload) => {
    console.log('[FCM] Foreground message received:', payload);
    callback(payload);
  });

  return unsubscribe;
};

export { app, messaging };
