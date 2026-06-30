// Give the service worker access to Firebase Messaging.
// Note that you must import compat version because firebase service worker doesn't support ES6 imports directly in most browsers.
importScripts(
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js",
);

// Initialize the Firebase app in the service worker by passing in the messagingSenderId.
// Replace placeholders with your Firebase Config values.
const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "fire-detection-notification",
  storageBucket: "fire-detection-notification.firebasestorage.app",
  messagingSenderId: "",
  appId: "",
};

firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background messages.
const messaging = firebase.messaging();

// Optional background message handler
messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Received background message ",
    payload,
  );

  const notificationTitle = payload.data?.title || "Cảnh báo cháy!";
  const notificationOptions = {
    body: payload.data?.message || "Phát hiện có đám cháy, hãy kiểm tra ngay!",
    icon: payload.data?.image_url || "/icon-192x192.png",
    data: payload.data,
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
