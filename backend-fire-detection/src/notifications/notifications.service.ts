import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeApp, getApps, getApp, cert, App } from 'firebase-admin/app';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';
import * as fs from 'fs';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private firebaseApp: App | null = null;

  constructor(private readonly configService: ConfigService) { }

  onModuleInit() {
    const credentialsPath = this.configService.get<string>(
      'FIREBASE_CREDENTIALS_PATH',
    );

    if (!credentialsPath) {
      this.logger.warn(
        '[FCM] FIREBASE_CREDENTIALS_PATH is not set. Push notifications will be disabled.',
      );
      return;
    }

    if (!fs.existsSync(credentialsPath)) {
      this.logger.error(
        `[FCM] Service account file not found at: ${credentialsPath}. Push notifications will be disabled.`,
      );
      return;
    }

    try {
      // Tránh khởi tạo lại nếu app đã tồn tại (hot-reload)
      if (getApps().length === 0) {
        const serviceAccount = JSON.parse(
          fs.readFileSync(credentialsPath, 'utf-8'),
        );
        this.firebaseApp = initializeApp({
          credential: cert(serviceAccount),
        });
        this.logger.log('[FCM] Firebase Admin SDK initialized successfully.');
      } else {
        this.firebaseApp = getApp();
        this.logger.log('[FCM] Reusing existing Firebase Admin app instance.');
      }
    } catch (error) {
      this.logger.error(
        '[FCM] Failed to initialize Firebase Admin SDK:',
        error,
      );
    }
  }

  /**
   * Gửi push notification cảnh báo cháy tới các thiết bị.
   * @param fcmTokens Danh sách FCM registration token của các thiết bị đích
   * @param alertData Dữ liệu đính kèm (alert id, camera id, ...)
   */
  async sendFireAlert(
    fcmTokens: string[],
    alertData: Record<string, any>,
  ): Promise<void> {
    if (!this.firebaseApp) {
      this.logger.warn('[FCM] Firebase is not initialized...');
      return;
    }

    if (!fcmTokens || fcmTokens.length === 0) {
      this.logger.warn('[FCM] No tokens provided to send fire alert.');
      return;
    }

    const message: MulticastMessage = {
      tokens: fcmTokens,
      data: {
        title: 'CẢNH BÁO CHÁY!',
        alert_id: String(alertData.id ?? ''),
        camera_id: String(alertData.camera_id ?? ''),
        timestamp: String(alertData.timestamp ?? new Date().toISOString()),
        message: String(alertData.message ?? ''),
        image_url: String(alertData.image_url ?? '')
      },
    };

    try {
      const messaging = getMessaging(this.firebaseApp);
      const response = await messaging.sendEachForMulticast(message);
      this.logger.log(
        `[FCM] Push notification multicast status: successCount = ${response.successCount}, failureCount = ${response.failureCount}`,
      );
    } catch (error) {
      this.logger.error('[FCM] Failed to send push notification multicast:', error);
    }
  }
}
