import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { AlertsService } from '../alerts/alerts.service';
import { Gateway } from '../gateway/gateway';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class StorageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StorageService.name);

  public maxStorageMb = 5000;
  public tempRetentionMinutes = 15;
  public cleanupIntervalSeconds = 300;

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly configService: ConfigService,
    private readonly alertsService: AlertsService,
    private readonly appGateway: Gateway,
  ) {}

  onModuleInit() {
    this.startCleanupInterval();
  }

  onModuleDestroy() {
    this.stopCleanupInterval();
  }

  public updateConfig(
    maxStorageMb?: number,
    tempRetentionMinutes?: number,
    cleanupIntervalSeconds?: number,
  ) {
    let restartNeeded = false;
    if (maxStorageMb !== undefined) {
      this.maxStorageMb = maxStorageMb;
    }
    if (tempRetentionMinutes !== undefined) {
      this.tempRetentionMinutes = tempRetentionMinutes;
    }
    if (
      cleanupIntervalSeconds !== undefined &&
      cleanupIntervalSeconds !== this.cleanupIntervalSeconds
    ) {
      this.cleanupIntervalSeconds = cleanupIntervalSeconds;
      restartNeeded = true;
    }

    this.logger.log(
      `Storage configuration updated: maxStorageMb=${this.maxStorageMb}, tempRetentionMinutes=${this.tempRetentionMinutes}, cleanupIntervalSeconds=${this.cleanupIntervalSeconds}`,
    );

    if (restartNeeded) {
      this.startCleanupInterval();
    }
  }

  private startCleanupInterval() {
    this.stopCleanupInterval();
    const interval = setInterval(
      () => this.runCleanup(),
      this.cleanupIntervalSeconds * 1000,
    );
    this.schedulerRegistry.addInterval('storage-cleanup', interval);
    this.logger.log(
      `Storage cleanup scheduler started with interval: ${this.cleanupIntervalSeconds}s`,
    );
  }

  private stopCleanupInterval() {
    try {
      this.schedulerRegistry.deleteInterval('storage-cleanup');
    } catch (e) {
      // Ignore error if interval does not exist
    }
  }

  async runCleanup() {
    this.logger.log('Starting storage cleanup cycle...');
    try {
      const aiWorkerDir =
        this.configService.get<string>('AI_WORKER_DIR') ||
        path.join(process.cwd(), '..', 'ai_worker');
      const tempVideosDir = path.join(aiWorkerDir, 'saved_videos', 'temp');
      const tempImagesDir = path.join(aiWorkerDir, 'saved_images', 'temp');
      const savedVideosDir = path.join(aiWorkerDir, 'saved_videos');
      const savedImagesDir = path.join(aiWorkerDir, 'saved_images');

      // 1. Clean TEMP directories
      const tempDeleted = this.cleanTempDirs(
        [tempVideosDir, tempImagesDir],
        this.tempRetentionMinutes,
      );

      // 2. LRU cleanup on main directories
      const lruDeleted = this.enforceLruLimit(
        [savedVideosDir, savedImagesDir],
        this.maxStorageMb,
      );

      const allDeleted = [...tempDeleted, ...lruDeleted];
      if (allDeleted.length > 0) {
        this.logger.log(
          `Cleanup completed: deleted ${tempDeleted.length} temp files and ${lruDeleted.length} main files`,
        );

        // Update DB
        const updatedCount =
          await this.alertsService.nullifyDeletedFiles(allDeleted);
        this.logger.log(
          `DB updated: set null for ${updatedCount} file references`,
        );

        // Broadcast to frontend
        this.appGateway.broadcast('MEDIA_DELETED', {
          deleted_files: allDeleted,
        });
      } else {
        this.logger.log('Cleanup completed: no files needed deletion');
      }
    } catch (error) {
      this.logger.error('Error during storage cleanup cycle:', error);
    }
  }

  private cleanTempDirs(dirs: string[], retentionMinutes: number): string[] {
    const deletedFiles: string[] = [];
    const now = Date.now();
    const cutoff = retentionMinutes * 60 * 1000;

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;

      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          try {
            const stats = fs.statSync(filePath);
            if (stats.isFile()) {
              const age = now - stats.mtimeMs;
              if (age > cutoff) {
                fs.unlinkSync(filePath);
                deletedFiles.push(file);
                this.logger.log(
                  `Deleted expired temp file: ${file} (${Math.round(age / 60000)} minutes old)`,
                );
              }
            }
          } catch (e) {
            this.logger.error(`Failed to process temp file ${file}:`, e);
          }
        }
      } catch (e) {
        this.logger.error(`Failed to read temp directory ${dir}:`, e);
      }
    }
    return deletedFiles;
  }

  private enforceLruLimit(dirs: string[], maxMb: number): string[] {
    const deletedFiles: string[] = [];
    const allFiles: {
      path: string;
      name: string;
      mtimeMs: number;
      sizeBytes: number;
    }[] = [];
    let totalSizeBytes = 0;

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;

      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          try {
            const stats = fs.statSync(filePath);
            if (stats.isFile()) {
              allFiles.push({
                path: filePath,
                name: file,
                mtimeMs: stats.mtimeMs,
                sizeBytes: stats.size,
              });
              totalSizeBytes += stats.size;
            }
          } catch (e) {
            // Ignore files that cannot be stats'd
          }
        }
      } catch (e) {
        this.logger.error(`Failed to read main directory ${dir}:`, e);
      }
    }

    const currentMb = totalSizeBytes / (1024 * 1024);
    if (currentMb <= maxMb) {
      this.logger.log(
        `Storage usage: ${currentMb.toFixed(1)} MB / ${maxMb} MB — OK`,
      );
      return deletedFiles;
    }

    this.logger.warn(
      `Storage limit exceeded: ${currentMb.toFixed(1)} MB > ${maxMb} MB. Starting cleanup...`,
    );

    // Sort files by modification time (mtimeMs) ascending (oldest first)
    allFiles.sort((a, b) => a.mtimeMs - b.mtimeMs);

    for (const fileInfo of allFiles) {
      if (totalSizeBytes / (1024 * 1024) <= maxMb) {
        break;
      }
      try {
        fs.unlinkSync(fileInfo.path);
        totalSizeBytes -= fileInfo.sizeBytes;
        deletedFiles.push(fileInfo.name);
        this.logger.log(
          `LRU Deleted: ${fileInfo.name} (${(fileInfo.sizeBytes / (1024 * 1024)).toFixed(2)} MB) — Remaining: ${(totalSizeBytes / (1024 * 1024)).toFixed(1)} MB`,
        );
      } catch (e) {
        this.logger.error(`Failed to delete main file ${fileInfo.name}:`, e);
      }
    }

    return deletedFiles;
  }
}
