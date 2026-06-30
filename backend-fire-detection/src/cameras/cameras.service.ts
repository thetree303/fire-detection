import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Camera } from './camera.entity';
import { User } from '../users/user.entity';
import { CreateCameraDto } from './dto/create-camera.dto';
import { UpdateCameraDto } from './dto/update-camera.dto';
import { RoomsService } from '../rooms/rooms.service';
import { CameraStatus } from './enums/camera-status.enum';
import { AiManagerService } from './ai-manager.service';
import { MqttService } from '../mqtt/mqtt.service';

@Injectable()
export class CamerasService {
  private readonly logger = new Logger(CamerasService.name);

  constructor(
    @InjectRepository(Camera)
    private readonly cameraRepository: Repository<Camera>,
    private readonly roomsService: RoomsService,
    private readonly aiManagerService: AiManagerService,
    @Inject(forwardRef(() => MqttService))
    private readonly mqttService: MqttService,
  ) { }

  /**
   * HÀM TÌM KIẾM TẤT CẢ CAMERA CỦA USER
   * @param user User hiện tại (lấy từ JWT Token)
   * @returns
   */
  async findAll(user: User): Promise<Camera[]> {
    return this.cameraRepository.find({
      where: { owner: { id: user.id } },
      relations: ['room', 'owner'],
    });
  }

  /**
   * HÀM TÌM KIẾM CAMERA CỦA USER THEO ID
   * @param id ID của camera
   * @param user User hiện tại (lấy từ JWT Token)
   * @returns
   */
  async findOne(id: number, user: User): Promise<Camera> {
    const camera = await this.cameraRepository.findOne({
      where: { id, owner: { id: user.id } },
      relations: ['room', 'owner'],
    });
    if (!camera) {
      throw new NotFoundException('Camera not found');
    }
    return camera;
  }

  /**
   * HÀM TÌM KIẾM CAMERA THEO ĐỊA CHỈ MAC (CỐ ĐỊNH KHÔNG ĐỔI)
   * @param macAddress Địa chỉ mac của camera
   * @returns
   */
  async findByMac(macAddress: string) {
    return await this.cameraRepository.findOne({
      where: { macAddress },
      relations: ['owner'],
    });
  }

  /**
   * HÀM TÌM KIẾM CÁC CAMERA CỦA USER THEO PHÒNG
   * @param roomId ID của phòng
   * @param user User hiện tại (lấy từ JWT Token)
   * @returns
   */
  async findByRoom(roomId: number, user: User): Promise<Camera[]> {
    const room = await this.roomsService
      .findAll(user)
      .then((rooms) => rooms.find((r) => r.id === roomId));
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    return this.cameraRepository.find({ where: { room: { id: room.id } } });
  }

  /**
   * HÀM TẠO MỚI CAMERA THỦ CÔNG TỪ DỮ LIỆU NGƯỜI DÙNG TỰ NHẬP
   * @param data Dữ liệu camera đã được validate
   * @param user User hiện tại (lấy từ JWT Token)
   * @returns
   */
  async create(data: CreateCameraDto, user: User): Promise<Camera> {
    // Chuẩn hoá MAC: chữ hoa, bỏ dấu ':'
    const normalizedMac = data.macAddress.toUpperCase().replace(/:/g, '');

    // Kiểm tra xem MAC đã tồn tại chưa
    const existing = await this.cameraRepository.findOne({
      where: { macAddress: normalizedMac },
    });
    if (existing) {
      throw new ConflictException(
        `Thiết bị với MAC '${normalizedMac}' đã được đăng ký. Không thể thêm lại.`,
      );
    }

    const room = data.roomId
      ? await this.roomsService.findOne(data.roomId, user)
      : undefined;

    const camera = this.cameraRepository.create({
      macAddress: normalizedMac,
      name: data.name,
      description: data.description,
      room,
      owner: user,
      status: CameraStatus.NOT_BINDED,
      maxTemperature: data.maxTemperature,
      maxGasPercent: data.maxGasPercent,
      smokeTrigger: data.smokeTrigger,
      flameTrigger: data.flameTrigger,
    });

    const saved = await this.cameraRepository.save(camera);
    this.logger.log(
      `[CREATE] Camera '${saved.name}' (MAC: ${normalizedMac}) registered by user '${user.username}' (id: ${user.id}). Waiting for device discovery.`,
    );
    return saved;
  }

  /**
   * HÀM CẬP NHẬT THÔNG TIN CAMERA THEO ID
   * @param id ID của camera
   * @param data Dữ liệu camera đã được validate
   * @param user User hiện tại (lấy từ JWT Token)
   * @returns
   */
  async update(id: number, data: UpdateCameraDto, user: User): Promise<any> {
    const camera = await this.findOne(id, user);
    const room = data.roomId
      ? await this.roomsService.findOne(data.roomId, user)
      : camera.room;
    await this.cameraRepository.update(id, {
      name: data.name ?? camera.name,
      room: room,
      description: data.description ?? camera.description,
      status: data.status ?? camera.status,
      streamUrl:
        data.streamUrl !== undefined ? data.streamUrl : camera.streamUrl,
      yoloConfidence:
        data.yoloConfidence !== undefined
          ? data.yoloConfidence
          : camera.yoloConfidence,
      maxTemperature:
        data.maxTemperature !== undefined
          ? data.maxTemperature
          : camera.maxTemperature,
      maxGasPercent:
        data.maxGasPercent !== undefined
          ? data.maxGasPercent
          : camera.maxGasPercent,
      smokeTrigger:
        data.smokeTrigger !== undefined
          ? data.smokeTrigger
          : camera.smokeTrigger,
      flameTrigger:
        data.flameTrigger !== undefined
          ? data.flameTrigger
          : camera.flameTrigger,
    });
    const updatedCamera = await this.findOne(id, user);

    // Tat/Khoi dong lai AI Worker neu co thay doi ve streamUrl hoac status
    if (
      updatedCamera.status === CameraStatus.OFFLINE ||
      updatedCamera.status === CameraStatus.NOT_BINDED
    ) {
      this.aiManagerService.stopWorker(id);
    } else if (
      updatedCamera.status === CameraStatus.ONLINE &&
      updatedCamera.streamUrl
    ) {
      this.aiManagerService.stopWorker(id);
      this.aiManagerService.startWorker(updatedCamera);
    }

    return this.findOne(id, user);
  }

  async delete(id: number, user: User): Promise<any> {
    const camera = await this.findOne(id, user);
    // Tắt AI Worker nếu camera đang online trước khi xóa
    if (camera.status === CameraStatus.ONLINE) {
      this.aiManagerService.stopWorker(id);
    }
    // Xóa trạng thái khỏi Map để tránh Memory Leak
    this.mqttService.clearCameraState(camera.id);
    return this.cameraRepository.delete(camera.id);
  }

  /**
   * HÀM TÌM KIẾM CAMERA THEO ID (không cần user, dùng nội bộ)
   * @param id ID của camera
   */
  async findById(id: number): Promise<Camera | null> {
    return this.cameraRepository.findOne({
      where: { id },
      relations: ['owner'],
    });
  }

  /**
   * HÀM Xử LÝ DISCOVERY: CẬP NHẬT CAMERA KHI THIẾT BỊ BẬT LÊN VÀ GỬi BẢN TIN MQTT.
   * @param mac Địa chỉ MAC (không có dấu ':')
   * @param ip Địa chỉ IP hiện tại của thiết bị
   * @param streamUrl Stream URL của camera (nếu có)
   * @param type Loại thiết bị (VD: 'esp32-cam', 'esp32-nocam')
   * @param sensors Danh sách cảm biến thiết bị hỗ trợ (VD: ['ai', 'temperature', 'gas', 'smoke', 'flame'])
   */
  async handleDiscovery(
    mac: string,
    ip: string,
    streamUrl: string,
    type?: string,
    sensors?: string[],
  ): Promise<Camera | null> {
    const normalizedMac = mac.toUpperCase().replace(/:/g, '');
    const camera = await this.findByMac(normalizedMac);

    // Thiết bị chưa được claim => bỏ qua, không tự tạo
    if (!camera) {
      this.logger.warn(
        `[DISCOVERY] Ignored unknown MAC: ${normalizedMac} — not claimed yet.`,
      );
      return null;
    }

    // Thiết bị đã được claim => cập nhật trạng thái
    let isChanged = false;

    if (camera.ipAddress !== ip) {
      camera.ipAddress = ip;
      isChanged = true;
    }
    if (camera.streamUrl !== streamUrl) {
      camera.streamUrl = streamUrl;
      isChanged = true;
    }
    if (camera.status !== CameraStatus.ONLINE) {
      camera.status = CameraStatus.ONLINE;
      isChanged = true;
    }

    if (Array.isArray(sensors)) {
      const supportedSensors = sensors.map((s) => s.toLowerCase());

      // AI (yoloConfidence)
      if (supportedSensors.includes('ai')) {
        // Hỗ trợ: nếu hiện tại là null thì khởi tạo giá trị mặc định 0.5 (BẬT)
        if (camera.yoloConfidence === null) {
          camera.yoloConfidence = 0.5;
          isChanged = true;
        }
      } else {
        // Không hỗ trợ: đảm bảo luôn là null
        if (camera.yoloConfidence !== null) {
          camera.yoloConfidence = null;
          isChanged = true;
        }
      }

      // Nhiệt độ (maxTemperature)
      if (supportedSensors.includes('temperature')) {
        if (camera.maxTemperature === null) {
          camera.maxTemperature = 60; // Mặc định 60°C (BẬT)
          isChanged = true;
        }
      } else {
        if (camera.maxTemperature !== null) {
          camera.maxTemperature = null;
          isChanged = true;
        }
      }

      // Khí gas (maxGasPercent)
      if (supportedSensors.includes('gas')) {
        if (camera.maxGasPercent === null) {
          camera.maxGasPercent = 60; // Mặc định 60% (BẬT)
          isChanged = true;
        }
      } else {
        if (camera.maxGasPercent !== null) {
          camera.maxGasPercent = null;
          isChanged = true;
        }
      }

      // Cảm biến khói (smokeTrigger)
      if (supportedSensors.includes('smoke')) {
        if (camera.smokeTrigger === null) {
          camera.smokeTrigger = true; // Mặc định BẬT
          isChanged = true;
        }
      } else {
        if (camera.smokeTrigger !== null) {
          camera.smokeTrigger = null;
          isChanged = true;
        }
      }

      // Cảm biến lửa (flameTrigger)
      if (supportedSensors.includes('flame')) {
        if (camera.flameTrigger === null) {
          camera.flameTrigger = true; // Mặc định BẬT
          isChanged = true;
        }
      } else {
        if (camera.flameTrigger !== null) {
          camera.flameTrigger = null;
          isChanged = true;
        }
      }

      this.logger.log(
        `[DISCOVERY] Sensor config updated for '${camera.name}' (${normalizedMac}). ` +
        `Type: ${type ?? 'unknown'} | Supported sensors: [${supportedSensors.join(', ')}]`,
      );
    }

    if (isChanged) {
      await this.cameraRepository.save(camera);
      this.logger.log(
        `[DISCOVERY] Camera '${camera.name}' (MAC: ${normalizedMac}) is now ONLINE.`,
      );
      // Khởi động lại AI Worker sau khi thiết bị online
      this.aiManagerService.stopWorker(camera.id);
      this.aiManagerService.startWorker(camera);
    }

    return camera;
  }
}
