import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { FireAlert } from './alert.entity';
import { CreateAlertDto } from './dto/create-alert.dto';
import { GetAlertsQueryDto } from './dto/get-alerts-query.dto';
import { GetCameraAlertsQueryDto } from './dto/get-camera-alerts-query.dto';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';

@Injectable()
export class AlertsService {
  private readonly logger: Logger = new Logger(AlertsService.name);

  constructor(
    @InjectRepository(FireAlert)
    private readonly alertRepository: Repository<FireAlert>,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) { }

  async createAlert(data: CreateAlertDto) {
    const alert = this.alertRepository.create({
      camera: { id: data.cameraId },
      imageFilename: data.imageFilename,
      videoFilename: data.videoFilename,
      detectedAt: new Date(data.detectedAt),
      level: data.level,
    });
    return this.alertRepository.save(alert);
  }

  async findAll(user: User, query: GetAlertsQueryDto = new GetAlertsQueryDto()) {
    const limit = query.limit || 10;
    const page = query.page || 1;
    const offset = (page - 1) * limit;

    const qbForData = this.getFilteredQueryBuilder(user.id, query);
    const qbForUnresolved = this.getFilteredQueryBuilder(user.id, query);

    const [dataAndCount, unresolvedCount] = await Promise.all([
      qbForData
        .orderBy('alert.detectedAt', 'DESC')
        .skip(offset)
        .take(limit)
        .getManyAndCount(),
      qbForUnresolved
        .andWhere('alert.isResolved = :isResolved', { isResolved: false })
        .getCount(),
    ]);

    const [data, totalItems] = dataAndCount;
    const totalPages = Math.ceil(totalItems / limit);

    return {
      data,
      meta: {
        currentPage: page,
        limit,
        totalItems,
        totalPages,
      },
      unresolvedCount,
    };
  }

  async findByCamera(cameraId: number, query: GetCameraAlertsQueryDto) {
    const limit = query.limit || 10;
    const qb = this.alertRepository
      .createQueryBuilder('alert')
      .leftJoinAndSelect('alert.camera', 'camera')
      .leftJoinAndSelect('camera.room', 'room')
      .where('camera.id = :cameraId', { cameraId });

    if (query.cursor) {
      qb.andWhere('alert.id < :cursor', { cursor: query.cursor });
    } else if (query.page && query.page > 1) {
      const offset = (query.page - 1) * limit;
      qb.skip(offset);
    }

    qb.orderBy('alert.detectedAt', 'DESC')
      .addOrderBy('alert.id', 'DESC')
      .take(limit + 1);

    const data = await qb.getMany();
    const hasNextPage = data.length > limit;
    const paginatedData = hasNextPage ? data.slice(0, limit) : data;

    let nextPage: number | null = null;
    let nextCursor: number | null = null;

    if (hasNextPage) {
      if (query.cursor) {
        const lastItem = paginatedData[paginatedData.length - 1];
        nextCursor = lastItem ? lastItem.id : null;
      } else {
        nextPage = (query.page || 1) + 1;
      }
    }

    const unresolvedCount = await this.alertRepository.count({
      where: {
        camera: { id: cameraId },
        isResolved: false,
      },
    });

    return {
      data: paginatedData,
      paging: {
        hasNextPage,
        ...(nextPage !== null ? { nextPage } : {}),
        ...(nextCursor !== null ? { nextCursor } : {}),
      },
      unresolvedCount,
    };
  }

  private getFilteredQueryBuilder(userId: number, query: GetAlertsQueryDto) {
    const qb = this.alertRepository
      .createQueryBuilder('alert')
      .leftJoinAndSelect('alert.camera', 'camera')
      .leftJoinAndSelect('camera.room', 'room')
      .where('camera.owner_id = :userId', { userId });

    if (query.cameraId) {
      qb.andWhere('camera.id = :cameraId', { cameraId: query.cameraId });
    }

    if (query.roomId) {
      qb.andWhere('room.id = :roomId', { roomId: query.roomId });
    }

    if (query.startDate) {
      qb.andWhere('alert.detectedAt >= :startDate', {
        startDate: query.startDate,
      });
    }

    if (query.endDate) {
      qb.andWhere('alert.detectedAt <= :endDate', { endDate: query.endDate });
    }

    return qb;
  }

  async update(id: number, data: Partial<FireAlert>) {
    return this.alertRepository.update(id, data);
  }

  /**
   * Nullify imageFilename và videoFilename cho tất cả record có filename
   * nằm trong danh sách deletedFiles (do StorageManager gửi qua MQTT).
   *
   * Cơ chế: Tìm các alert mà imageFilename HOẶC videoFilename khớp với
   * bất kỳ file nào trong danh sách, rồi set null để Frontend hiển thị
   * placeholder "Dữ liệu đã được dọn dẹp".
   *
   * @param deletedFiles Mảng tên file (vd: ["fire_001.jpg", "fire_001.webm"])
   * @returns Số record đã được cập nhật
   */
  async nullifyDeletedFiles(deletedFiles: string[]): Promise<number> {
    if (!deletedFiles || deletedFiles.length === 0) return 0;

    // Tìm tất cả alert có imageFilename hoặc videoFilename trong danh sách xóa
    const alertsToUpdate = await this.alertRepository.find({
      where: [
        { imageFilename: In(deletedFiles) },
        { videoFilename: In(deletedFiles) },
      ],
    });

    if (alertsToUpdate.length === 0) return 0;

    // Set null cho từng field tương ứng
    const updates = alertsToUpdate.map((alert) => {
      if (alert.imageFilename && deletedFiles.includes(alert.imageFilename)) {
        alert.imageFilename = null;
      }
      if (alert.videoFilename && deletedFiles.includes(alert.videoFilename)) {
        alert.videoFilename = null;
      }
      return alert;
    });

    await this.alertRepository.save(updates);
    return updates.length;
  }

  /**
   * Tìm bản ghi Alert để cập nhật
   */
  async updateAlertMedia(
    alertId: number,
    imageFilename?: string,
    videoFilename?: string,
  ): Promise<FireAlert | null> {
    const alert = await this.alertRepository.findOne({
      where: { id: alertId }, relations: ['camera', 'camera.room']
    });

    if (!alert) return null;
    if (imageFilename) alert.imageFilename = imageFilename;
    if (videoFilename) alert.videoFilename = videoFilename;

    return await this.alertRepository.save(alert);
  }

  /**
   * Xác nhận an toàn cho tất cả cảnh báo thuộc quyền quản lý của user
   * @param user User hiện tại
   * @returns Số lượng bản ghi đã được cập nhật
   */
  async resolveAllAlerts(user: User): Promise<number> {
    const qb = this.alertRepository.createQueryBuilder('alert')
      .innerJoin('alert.camera', 'camera')
      .where('camera.owner_id = :userId', { userId: user.id })
      .andWhere('alert.isResolved = :isResolved', { isResolved: false });

    const alertsToUpdate = await qb.select('alert.id').getMany();
    const alertIds = alertsToUpdate.map(a => a.id);

    if (alertIds.length === 0) return 0;

    const result = await this.alertRepository.update(alertIds, { isResolved: true });
    return result.affected || 0;
  }

  /**
   * Dọn dẹp toàn bộ dữ liệu cảnh báo và file vật lý (Chỉ dùng cho testing/development)
   */
  async purgeAllAlertsAndFiles(): Promise<void> {
    const aiWorkerDir = this.configService.get<string>('AI_WORKER_DIR');
    if (aiWorkerDir) {
      const imagesDir = path.join(aiWorkerDir, 'saved_images');
      const videosDir = path.join(aiWorkerDir, 'saved_videos');

      const deleteFilesInDir = async (dirPath: string, extensions: string[]) => {
        try {
          if (fs.existsSync(dirPath)) {
            const files = await fs.promises.readdir(dirPath);
            for (const file of files) {
              const ext = path.extname(file).toLowerCase();
              if (extensions.includes(ext)) {
                await fs.promises.unlink(path.join(dirPath, file));
              }
            }
          }
        } catch (error) {
          this.logger.error(`Error while cleaning directory ${dirPath}:`, error);
        }
      };

      await deleteFilesInDir(imagesDir, ['.jpg', '.jpeg', '.png']);
      await deleteFilesInDir(videosDir, ['.mp4', '.webm', '.avi']);
    }

    // Xóa sạch dữ liệu trong bảng
    await this.alertRepository.clear();
  }
}
