import { forwardRef, Module } from '@nestjs/common';
import { CamerasService } from './cameras.service';
import { AiManagerService } from './ai-manager.service';
import { CamerasController } from './cameras.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Camera } from './camera.entity';
import { RoomsModule } from '../rooms/rooms.module';
import { MqttModule } from '../mqtt/mqtt.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Camera]),
    RoomsModule,
    forwardRef(() => MqttModule),
  ],
  providers: [CamerasService, AiManagerService],
  controllers: [CamerasController],
  exports: [CamerasService],
})
export class CamerasModule {}
