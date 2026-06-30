import { Controller } from '@nestjs/common';
import {
  MessagePattern,
  Payload,
  Ctx,
  MqttContext,
} from '@nestjs/microservices';
import { MqttService } from './mqtt.service';
import { SensorDataDto } from './dto/sensor-data.dto';

@Controller()
export class MqttController {
  constructor(private readonly mqttService: MqttService) { }

  // ── NHẬN VIDEO STREAM TỪ CAMERA ──────────────────────────────────
  @MessagePattern('video/+')
  handleVideoFrame(@Payload() payload: any, @Ctx() context: MqttContext) {
    let base64Image = payload;

    // Tự động chuyển buffer sang base64
    if (Buffer.isBuffer(payload)) {
      if (payload.length > 2 && payload[0] === 0xff && payload[1] === 0xd8) {
        base64Image = payload.toString('base64');
      } else {
        base64Image = payload.toString('utf-8');
      }
    } else if (payload && payload.data && Buffer.isBuffer(payload.data)) {
      const buf = Buffer.from(payload.data);
      if (buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8) {
        base64Image = buf.toString('base64');
      } else {
        base64Image = buf.toString('utf-8');
      }
    } else if (typeof payload === 'string') {
      base64Image = payload;
    }

    this.mqttService.handleVideoFrame(base64Image, context);
  }

  // ── NHẬN DỮ LIỆU TỪ CẢM BIẾN ────────────────────────────────────
  @MessagePattern('sensors/+')
  async handleSensorData(
    @Payload()
    sensorData: SensorDataDto,
    @Ctx() context: MqttContext,
  ) {
    await this.mqttService.handleSensorData(sensorData, context);
  }

  // ── NHẬN TÍN HIỆU TÌM KIẾM SERVER TỪ CAMERA ─────────────────────
  @MessagePattern('discovery/cameras')
  async handleDeviceDiscovery(
    @Payload()
    payload: {
      mac: string;
      ip: string;
      streamUrl: string;
      type?: string;
      sensors?: string[];
    },
    @Ctx() context: MqttContext,
  ) {
    await this.mqttService.handleDeviceDiscovery(payload, context);
  }

  // ── NHẬN TRẠNG THÁI CAMERA TỪ MQTT ──────────────────────────────
  @MessagePattern('status/+')
  async handleDeviceStatus(
    @Payload() status: string,
    @Ctx() context: MqttContext,
  ) {
    await this.mqttService.handleDeviceStatus(status, context);
  }

  // ── NHẬN CẢNH BÁO TỪ AI WORKER (Topic mới: alerts/ai_detected) ──
  // Thay thế 'alerts/fire_detected' cũ — AI Worker giờ ghi file vào TEMP
  @MessagePattern('alerts/ai_detected')
  async handleAiAlert(
    @Payload()
    payload: {
      camera_id: number;
      image_filename?: string;
      video_filename?: string;
    },
    @Ctx() context: MqttContext,
  ) {
    await this.mqttService.handleAiAlert(payload, context);
  }

  // ── NHẬN THÔNG BÁO FILE ẢNH/VIDEO ĐÃ SẴN SÀNG TỪ AI WORKER ───────
  @MessagePattern('alerts/image_ready')
  async handleMediaReady(@Payload() payload: any, @Ctx() context: MqttContext) {
    await this.mqttService.handleMediaReady('image', payload, context);
  }

  @MessagePattern('alerts/video_ready')
  async handleMediaReadyVideo(@Payload() payload: any, @Ctx() context: MqttContext) {
    await this.mqttService.handleMediaReady('video', payload, context);
  }
}
