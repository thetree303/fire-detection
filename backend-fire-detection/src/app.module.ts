import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AlertsModule } from './alerts/alerts.module';
import { FireAlert } from './alerts/alert.entity';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CamerasModule } from './cameras/cameras.module';
import { RoomsModule } from './rooms/rooms.module';
import { Room } from './rooms/room.entity';
import { Camera } from './cameras/camera.entity';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { User } from './users/user.entity';
import { GatewayModule } from './gateway/gateway.module';
import { MqttModule } from './mqtt/mqtt.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ScheduleModule } from '@nestjs/schedule';
import { StorageModule } from './storage/storage.module';
import * as path from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): TypeOrmModuleOptions => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        database: configService.get<string>('DB_NAME', 'fire_detection'),
        username: configService.get<string>('DB_USER', 'postgres'),
        password: configService.get<string>('DB_PASS', ''),
        entities: [FireAlert, Room, Camera, User],
        synchronize: configService.get<string>('NODE_ENV') !== 'production',
        logging: false,
      }),
    }),

    ServeStaticModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const aiWorkerDir =
          configService.get<string>('AI_WORKER_DIR') ||
          path.join(process.cwd(), '..', 'ai_worker');

        // Trỏ tới thư mục saved_images bên trong ai_worker
        const savedImagesDir = path.join(aiWorkerDir, 'saved_images');

        // Trỏ tới thư mục saved_videos bên trong ai_worker
        const savedVideosDir = path.join(aiWorkerDir, 'saved_videos');

        return [
          {
            rootPath: savedImagesDir,
            serveRoot: '/images',
          },
          {
            rootPath: savedVideosDir,
            serveRoot: '/videos',
          },
        ];
      },
    }),

    AlertsModule,
    CamerasModule,
    RoomsModule,
    AuthModule,
    UsersModule,
    GatewayModule,
    MqttModule,
    NotificationsModule,
    ScheduleModule.forRoot(),
    StorageModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
