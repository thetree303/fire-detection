/**
 * AI Manager Service
 * Nhiệm vụ: Quản lý, tạo và tắt các tiến trình con chạy AI Worker (ai_worker.py) cho từng camera.
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Camera } from './camera.entity';
import { CameraStatus } from './enums/camera-status.enum';
import * as path from 'path';

// Hằng số kiểm soát restart
const MAX_RESTART_ATTEMPTS = 5;
const INITIAL_RESTART_DELAY_MS = 5000; // 5 giây ban đầu

@Injectable()
export class AiManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiManagerService.name);

  // Các tiến trình con đang hoạt động
  private activeWorkers = new Map<number, ChildProcess>();

  // Map theo dõi số lần restart và delay tiếp theo cho mỗi camera
  private restartAttempts = new Map<number, number>();

  private readonly pythonScriptDir =
    process.env.AI_WORKER_DIR || path.join(process.cwd(), '..', 'ai_worker');
  private readonly pythonScriptPath = path.join(
    this.pythonScriptDir,
    'main.py',
  );
  private readonly pythonEnvPath =
    process.env.PYTHON_VENV_DIR ||
    path.join(process.cwd(), '..', 'venv', 'bin', 'python');

  constructor(
    @InjectRepository(Camera)
    private cameraRepository: Repository<Camera>,
  ) {}

  // Tự chạy AI Worker cho từng camera khi server NestJS khởi động
  async onModuleInit() {
    this.logger.log('Starting AI Worker for each camera...');
    const cameras = await this.cameraRepository.find({
      where: { status: CameraStatus.ONLINE },
    });

    for (const camera of cameras) {
      if (camera.streamUrl) {
        this.startWorker(camera);
      }
    }
  }

  // Tắt tất cả AI Worker khi server NestJS dừng lại
  onModuleDestroy() {
    this.logger.log('Stopping all AI Workers...');
    // eslint-disable-next-line
    for (const [cameraId, worker] of this.activeWorkers.entries()) {
      worker.kill('SIGTERM');
    }
  }

  // Kích hoạt tiến trình con cho AI Worker của 1 camera
  startWorker(camera: Camera) {
    if (this.activeWorkers.has(camera.id)) {
      this.logger.warn(`AI Worker for Camera ${camera.id} is already running!`);
      return;
    }

    if (!camera.streamUrl) {
      this.logger.error(`No Stream URL for Camera ${camera.id}!`);
      return;
    }

    this.logger.log(
      `Starting AI Worker for Camera: ${camera.name} (ID: ${camera.id})`,
    );

    // Command: python3 main.py --source <url> --camera_id <id> --camera_name <name> --show_debug True/False
    // Stream URL = 0 tương ứng webcam
    const workerProcess = spawn(
      this.pythonEnvPath,
      [
        this.pythonScriptPath,
        '--source',
        camera.streamUrl,
        '--camera_id',
        camera.id.toString(),
        '--camera_name',
        camera.name,
        '--yolo_conf',
        (camera.yoloConfidence ?? 0.5).toString(),
        '--show_debug',
        process.env.AI_WORKER_DEBUG === 'true' ? 'True' : 'False',
      ],
      {
        cwd: this.pythonScriptDir, // RẤT QUAN TRỌNG: Đặt thư mục làm việc để Python tìm thấy 'best.pt'
        env: {
          ...process.env,
          PYTHONPATH: this.pythonScriptDir,
          VIRTUAL_ENV: path.dirname(path.dirname(this.pythonEnvPath)),
          QT_LOGGING_RULES: '*.warning=false', // Tắt hết cảnh báo của Qt
        },
      },
    );

    // Bắt log từ tiến trình con, để hiển thị trên console của NestJS
    workerProcess.stdout.on('data', (data) => {
      // eslint-disable-next-line
      this.logger.log(`[CAM-ID: ${camera.id}] ${data.toString().trim()}`);
    });

    workerProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (
        msg.includes('OpenCV: FFMPEG: tag') &&
        msg.includes('is not supported')
      ) {
        this.logger.warn(`[CAM-ID: ${camera.id}] ${msg}`);
      } else {
        this.logger.error(`[CAM-ID: ${camera.id}] ${msg}`);
      }
    });

    workerProcess.on('close', (code) => {
      this.activeWorkers.delete(camera.id);

      if (code === null) {
        // Tiến trình nhận tín hiệu close từ hệ thống, không phải do lỗi — reset bộ đếm restart
        this.restartAttempts.delete(camera.id);
        this.logger.warn(
          `AI Worker for Camera ${camera.id} closed by system! (Code: ${code})`,
        );
      } else if (code !== 0) {
        // Tiến trình gặp lỗi — áp dụng Exponential Backoff với giới hạn số lần thử
        const attempts = (this.restartAttempts.get(camera.id) ?? 0) + 1;

        if (attempts > MAX_RESTART_ATTEMPTS) {
          this.logger.error(
            `AI Worker for Camera ${camera.id} crashed ${MAX_RESTART_ATTEMPTS} times. Giving up!`,
          );
          this.restartAttempts.delete(camera.id);
          return;
        }

        this.restartAttempts.set(camera.id, attempts);
        // Exponential backoff: 5s, 10s, 20s, 40s, 80s
        const delay = INITIAL_RESTART_DELAY_MS * Math.pow(2, attempts - 1);

        this.logger.error(
          `AI Worker for Camera ${camera.id} crashed! (Code: ${code}) ` +
            `Attempt ${attempts}/${MAX_RESTART_ATTEMPTS}. Restarting in ${delay / 1000}s...`,
        );

        setTimeout(() => {
          (async () => {
            const newCamera = await this.cameraRepository.findOne({
              where: { id: camera.id },
            });
            if (newCamera) {
              this.startWorker(newCamera);
            }
          })().catch(() => {
            this.logger.error(
              `Error in restart worker for Camera ${camera.id}!`,
            );
          });
        }, delay);
      } else {
        // Thoát bình thường (code === 0) — reset bộ đếm
        this.restartAttempts.delete(camera.id);
        this.logger.log(`AI Worker for Camera ${camera.id} exited normally.`);
      }
    });

    this.activeWorkers.set(camera.id, workerProcess);
  }

  // Tắt tiến trình
  stopWorker(cameraId: number) {
    const worker = this.activeWorkers.get(cameraId);
    if (worker) {
      worker.kill('SIGTERM');

      // Force kill sau 5s nếu vẫn chưa thoát
      setTimeout(() => {
        if (worker.exitCode === null && worker.signalCode === null) {
          this.logger.warn(
            `Force kill AI Worker for camera ${cameraId} using SIGKILL`,
          );
          worker.kill('SIGKILL');
        }
      }, 5000);

      this.activeWorkers.delete(cameraId);
    }
    // Reset bộ đếm restart khi worker bị dừng thủ công
    this.restartAttempts.delete(cameraId);
  }
}
