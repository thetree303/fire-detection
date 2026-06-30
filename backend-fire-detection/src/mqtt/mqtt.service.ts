import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import * as mqtt from 'mqtt';
import * as fs from 'fs';
import * as path from 'path';
import { Gateway } from '../gateway/gateway';
import { AlertsService } from '../alerts/alerts.service';
import { CamerasService } from '../cameras/cameras.service';
import { AlertLevel } from '../alerts/enums/alert-level.enum';
import { MqttContext } from '@nestjs/microservices';
import { SensorDataDto } from './dto/sensor-data.dto';
import { Camera } from '../cameras/camera.entity';
import { CameraState } from './interfaces/camera-state.interface';
import { CameraStatus } from '../cameras/enums/camera-status.enum';
import { NotificationsService } from '../notifications/notifications.service';

// ─────────────────────────────────────────────────────────────────
// CẤU HÌNH MQTT SERVICE
// ─────────────────────────────────────────────────────────────────
const AI_ACTIVE_WINDOW_MS = 15_000;
const ALERT_COOLDOWN_MS = 60_000;

@Injectable()
export class MqttService {
  private readonly logger: Logger = new Logger(MqttService.name);
  private readonly cameraStates = new Map<number, CameraState>();
  private activeMqttClient?: any;
  private mqttPublisher: mqtt.MqttClient;

  constructor(
    private readonly appGateway: Gateway,
    private readonly alertsService: AlertsService,
    @Inject(forwardRef(() => CamerasService))
    private readonly camerasService: CamerasService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.mqttPublisher = mqtt.connect(
      process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    );
    this.mqttPublisher.on('connect', () => {
      this.logger.log('MqttService Publisher ready to send commands.');
    });
  }

  private updateMqttClient(context?: MqttContext) {
    if (context) {
      try {
        const client = context.getArgByIndex(1);
        if (client) {
          this.activeMqttClient = client;
        }
      } catch (error) {
        this.logger.error('Error getting MqttClient from context:', error);
      }
    }
  }

  handleVideoFrame(base64Image: string, context: MqttContext) {
    this.updateMqttClient(context);
    const topic = context.getTopic();
    const cameraId = topic.split('/')[1];
    this.appGateway.broadcast(`VIDEO_FRAME_${cameraId}`, base64Image);
  }

  async handleSensorData(sensorData: SensorDataDto, context: MqttContext) {
    this.updateMqttClient(context);
    const topic = context.getTopic();
    const macAddress = this.extractMacAddress(topic);

    if (!macAddress) return;

    try {
      const camera = await this.camerasService.findByMac(macAddress);
      if (!camera) return;

      this.appGateway.broadcast(`SENSOR_DATA_${macAddress}`, sensorData);

      const state = this.getOrCreateCameraState(camera.id);
      state.latestSensorData = sensorData;

      await this.evaluateAndPublishAlarmState(camera);
    } catch (error) {
      this.logger.error(
        `Error processing sensor data from MAC ${macAddress}:`,
        error,
      );
    }
  }

  async handleAiAlert(payload: any, context?: MqttContext) {
    if (context) this.updateMqttClient(context);

    let parsedPayload = payload;
    if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
      try {
        parsedPayload = JSON.parse(payload.toString());
      } catch (e) {
        this.logger.error('[AI-ALERT] Invalid payload format', payload);
        return;
      }
    }

    const cameraId = Number(parsedPayload?.camera_id || parsedPayload?.cameraId);
    const tempVideo = parsedPayload?.temp_video || parsedPayload?.tempVideo;

    if (!cameraId || isNaN(cameraId)) return;

    const state = this.getOrCreateCameraState(cameraId);
    state.aiTriggered = true;
    state.lastAiActive = Date.now();
    if (tempVideo) state.tempVideoFilename = tempVideo;

    if ((state as any).turnOffTimeout) {
      clearTimeout((state as any).turnOffTimeout);
    }

    (state as any).turnOffTimeout = setTimeout(async () => {
      try {
        const cam = await this.camerasService.findById(cameraId);
        if (cam) await this.evaluateAndPublishAlarmState(cam);
      } catch (err) { }
    }, AI_ACTIVE_WINDOW_MS + 1000);

    try {
      const camera = await this.camerasService.findById(cameraId);
      if (camera) await this.evaluateAndPublishAlarmState(camera);
    } catch (error) { }
  }

  async handleMediaReady(type: string, payload: any, context?: MqttContext): Promise<void> {
    if (context) this.updateMqttClient(context);

    let parsedPayload = payload;
    if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
      try { parsedPayload = JSON.parse(payload.toString()); }
      catch (e) { return; }
    }

    const alertId = Number(parsedPayload?.alert_id || parsedPayload?.alertId);
    const cameraId = Number(parsedPayload?.camera_id || parsedPayload?.cameraId);
    let imageFilename = '';
    let videoFilename = '';
    if (type === 'image') {
      imageFilename = parsedPayload?.image_filename || parsedPayload?.imageFilename;
    } else if (type === 'video') {
      videoFilename = parsedPayload?.video_filename || parsedPayload?.videoFilename;
    }

    if (!alertId || isNaN(alertId)) return;

    try {
      const updatedAlert = await this.alertsService.updateAlertMedia(
        alertId,
        imageFilename || '',
        videoFilename || '',
      );

      if (updatedAlert) {
        this.logger.log(`[MEDIA-READY] Updated AI Alert ${updatedAlert.id} with ${type} file.`);
        this.appGateway.broadcast('ALERTS_REFRESH', { camera_id: cameraId });
      }
    } catch (error) {
      this.logger.error('[MEDIA-READY] Error:', error);
    }
  }

  clearCameraState(cameraId: number): void {
    if (this.cameraStates.has(cameraId)) this.cameraStates.delete(cameraId);
  }

  private getOrCreateCameraState(cameraId: number): CameraState {
    let state = this.cameraStates.get(cameraId);
    if (!state) {
      state = { latestSensorData: undefined, aiTriggered: false, lastAiActive: 0, lastBuzzerState: 0, lastAlertTime: 0 };
      this.cameraStates.set(cameraId, state);
    }
    return state;
  }

  private async evaluateAndPublishAlarmState(camera: Camera): Promise<void> {
    const state = this.getOrCreateCameraState(camera.id);
    const sensorData = state.latestSensorData;
    const deviceCommandTopic = camera.macAddress ? `commands/${camera.macAddress}` : null;

    const sendMqttCommand = (topic: string, message: string) => {
      if (!topic) return;
      try { this.mqttPublisher.publish(topic, message); }
      catch (err) { this.logger.error(`Error MQTT to ${topic}:`, err); }
    };

    const sendBuzzerCommand = (status: number) => {
      if (!deviceCommandTopic) return;
      sendMqttCommand(deviceCommandTopic, JSON.stringify({ buzzer: status }));
    };

    const isAiActive = state.aiTriggered && (Date.now() - state.lastAiActive < AI_ACTIVE_WINDOW_MS);
    const yoloConf = camera.yoloConfidence !== null ? Number(camera.yoloConfidence) : 0;
    const maxTemp = camera.maxTemperature !== null ? Number(camera.maxTemperature) : 0;
    const maxGas = camera.maxGasPercent !== null ? Number(camera.maxGasPercent) : 0;
    const checkBool = (val: any) => val === true || String(val) === '1' || String(val) === 'true';

    const sensors = [
      { label: 'Camera AI', enabled: yoloConf > 0, triggered: isAiActive },
      { label: `Nhiệt độ (>= ${maxTemp}°C)`, enabled: maxTemp > 0, triggered: sensorData?.temperature !== undefined && Number(sensorData.temperature) >= maxTemp },
      { label: `Khí gas (>= ${maxGas}%)`, enabled: maxGas > 0, triggered: sensorData?.gasPercent !== undefined && Number(sensorData.gasPercent) >= maxGas },
      { label: 'Cảm biến khói', enabled: checkBool(camera.smokeTrigger), triggered: checkBool(sensorData?.smoke) },
      { label: 'Cảm biến lửa', enabled: checkBool(camera.flameTrigger), triggered: checkBool(sensorData?.flame) },
    ];

    const enabledSensors = sensors.filter((s) => s.enabled);

    if (enabledSensors.length === 0) {
      sendBuzzerCommand(0);
      return;
    }

    const allTriggered = enabledSensors.every((s) => s.triggered);

    if (allTriggered) {
      if (state.lastBuzzerState !== 1) {
        sendBuzzerCommand(1);
        state.lastBuzzerState = 1;
      }

      const lastAlertTime = state.lastAlertTime ?? 0;
      if (Date.now() - lastAlertTime > ALERT_COOLDOWN_MS) {
        state.lastAlertTime = Date.now();

        const pad = (n: number) => String(n).padStart(2, '0');
        const d = new Date();
        const alertTime = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

        // 1. TẠO ALERT DB RỖNG NGAY LẬP TỨC
        const newAlert = await this.alertsService.createAlert({
          cameraId: camera.id,
          imageFilename: '',
          videoFilename: '',
          detectedAt: new Date().toISOString(),
          level: AlertLevel.HIGH,
        });

        // 2. GỬI WEBSOCKET VÀ PUSH NOTIFICATION NGAY LẬP TỨC (Không cần chờ hình ảnh)
        const alertMessage = `Camera "${camera?.name || 'Unknown'}"` + (camera?.room?.name ? ` (Phòng: ${camera?.room?.name})` : '') + ` phát hiện có đám cháy xảy ra!`;
        this.appGateway.broadcast('FIRE_ALARM', {
          id: newAlert.id,
          camera_id: camera.id,
          timestamp: newAlert.detectedAt,
          message: alertMessage,
          trigger_source: isAiActive ? 'ai_and_sensor' : 'sensor_only',
        });

        if (camera?.owner?.fcmTokens && camera.owner.fcmTokens.length > 0) {
          try {
            await this.notificationsService.sendFireAlert(camera.owner.fcmTokens, {
              id: newAlert.id,
              camera_id: camera.id,
              cameraName: camera.name,
              timestamp: newAlert.detectedAt,
              message: alertMessage,
            });
            this.logger.log(`[ALARM] Push Notification sent to ${camera.name}`);
          } catch (e) {
            this.logger.error('[ALARM] Error sending FCM:', e);
          }
        }

        // 3. XỬ LÝ ẢNH/VIDEO (Fallback hoặc Gửi lệnh cho AI)
        if (isAiActive) {
          const captureTopic = `commands/capture_alert_media/${camera.id}`;
          const capturePayload = JSON.stringify(
            {
              alert_id: newAlert.id,
              temp_video: state.tempVideoFilename || null,
              alert_time: alertTime
            });
          sendMqttCommand(captureTopic, capturePayload);
        } else {
          this.captureSnapshotFallback(camera, newAlert.id, alertTime);
        }
      }
    } else {
      if (state.lastBuzzerState !== 0) {
        sendBuzzerCommand(0);
        state.lastBuzzerState = 0;
      }
    }
  }

  /**
   * Tính năng Fallback: Tự động tải file /jpg từ ESP32-CAM và lưu vào folder
   * Sử dụng khi người dùng không bật AI nhưng vẫn muốn lưu lại 1 bức ảnh khi có cháy.
   */
  private async captureSnapshotFallback(camera: Camera, alertId: number, alertTime: string) {
    if (!camera.streamUrl || !camera.streamUrl.includes('mjpeg')) return;

    try {
      // Chuyển URL dạng http://IP/mjpeg/1 thành http://IP/jpg
      const baseUrl = new URL(camera.streamUrl);
      const jpgUrl = `${baseUrl.protocol}//${baseUrl.host}/jpg`;

      // Tạo timeout an toàn 5 giây
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      // Node.js 18+ hỗ trợ native fetch
      const response = await fetch(jpgUrl, { signal: controller.signal as any });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Xác định thư mục lưu ảnh (đồng bộ với AI Worker)
      const aiWorkerDir = process.env.AI_WORKER_DIR || path.join(process.cwd(), '..', 'ai_worker');
      const imagesDir = path.join(aiWorkerDir, 'saved_images');

      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }

      const filename = `alert_${camera.id}_${alertTime}_fallback.jpg`;
      const filepath = path.join(imagesDir, filename);

      // Ghi file ảnh ra ổ cứng
      fs.writeFileSync(filepath, buffer);

      // Cập nhật lại tên ảnh vào DB
      await this.alertsService.update(alertId, { imageFilename: filename });
      this.logger.log(`[FALLBACK] Auto captured snapshot from ${camera.name}: ${filename}`);

      // Bắn event báo frontend tải lại hình
      this.appGateway.broadcast('ALERTS_REFRESH', { camera_id: camera.id });

    } catch (err) {
      this.logger.warn(`[FALLBACK] Auto snapshot from ${camera.name} failed: ${err.message}`);
    }
  }

  private extractMacAddress(topic: string): string | null {
    const topicParts = topic.split('/');
    if (topicParts.length < 2 || !topicParts[1]) return null;
    return topicParts[1].toUpperCase().replace(/:/g, '');
  }

  async handleDeviceDiscovery(data: any, context?: MqttContext) {
    if (context) this.updateMqttClient(context);
    if (!data.mac || !data.ip) return;
    await this.camerasService.handleDiscovery(data.mac, data.ip, data.streamUrl, data.type, data.sensors);
  }

  async handleDeviceStatus(status: string, context: MqttContext) {
    this.updateMqttClient(context);
    const macAddress = context.getTopic().split('/')[1];
    if (!macAddress) return;

    try {
      const camera = await this.camerasService.findByMac(macAddress);
      if (!camera) return;

      const newStatus = status === 'online' ? CameraStatus.ONLINE : CameraStatus.OFFLINE;

      if (camera.status !== newStatus) {
        await this.camerasService.update(camera.id, { status: newStatus }, camera.owner);
        this.appGateway.broadcast('DEVICE_STATUS_CHANGED', { camera_id: camera.id, mac: macAddress, status: newStatus });
      }
    } catch (error) { }
  }
}