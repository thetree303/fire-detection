import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { AlertsModule } from '../alerts/alerts.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [AlertsModule, GatewayModule],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
