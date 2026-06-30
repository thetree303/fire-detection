import { forwardRef, Module, Logger } from '@nestjs/common';
import { MqttController } from './mqtt.controller';
import { AlertsModule } from '../alerts/alerts.module';
import { CamerasModule } from '../cameras/cameras.module';
import { GatewayModule } from '../gateway/gateway.module';
import { MqttService } from './mqtt.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    AlertsModule,
    forwardRef(() => CamerasModule),
    GatewayModule,
    NotificationsModule,
  ],
  controllers: [MqttController],
  providers: [Logger, MqttService],
  // Export MqttService để CamerasModule có thể sử dụng
  exports: [MqttService],
})
export class MqttModule {}
