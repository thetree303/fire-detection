import { Controller, Get, Put, Body } from '@nestjs/common';
import { StorageService } from './storage.service';

@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Get('config')
  getConfig() {
    return {
      maxStorageMb: this.storageService.maxStorageMb,
      tempRetentionMinutes: this.storageService.tempRetentionMinutes,
      cleanupIntervalSeconds: this.storageService.cleanupIntervalSeconds,
    };
  }

  @Put('config')
  updateConfig(
    @Body()
    body: {
      maxStorageMb?: number;
      tempRetentionMinutes?: number;
      cleanupIntervalSeconds?: number;
    },
  ) {
    this.storageService.updateConfig(
      body.maxStorageMb,
      body.tempRetentionMinutes,
      body.cleanupIntervalSeconds,
    );
    return {
      message: 'Storage configuration updated successfully',
      config: {
        maxStorageMb: this.storageService.maxStorageMb,
        tempRetentionMinutes: this.storageService.tempRetentionMinutes,
        cleanupIntervalSeconds: this.storageService.cleanupIntervalSeconds,
      },
    };
  }
}
