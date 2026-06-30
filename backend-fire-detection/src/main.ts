import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import * as os from 'os';
import cookieParser from 'cookie-parser';

function getLocalIp() {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }

  return '127.0.0.1';
}

async function bootstrap() {
  const configService = new ConfigService();
  const app = await NestFactory.create(AppModule);

  const mqttPort = configService.get<number>('MQTT_PORT', 1883);

  // Kich hoat ClassSerializerInterceptor, tranh tra ve truong password khi get user
  app.useGlobalInterceptors(
    new (await import('@nestjs/common')).ClassSerializerInterceptor(
      app.get((await import('@nestjs/core')).Reflector),
    ),
  );

  // Validation Pipe de tu dong validate du lieu dau vao theo DTO
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.MQTT,
    options: {
      host: configService.get<string>('MQTT_HOST', 'localhost'),
      port: configService.get<number>('MQTT_PORT', 1883),
    },
  });

  // Dung cookie-parser de doc cookie tu request
  app.use(cookieParser());

  app.enableCors({
    origin: (origin, callback) => {
      const allowedOrigins = configService
        .get<string>('FRONTEND_URL')
        ?.split(',') || ['http://localhost:5173'];

      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  });

  await app.startAllMicroservices();
  await app.listen(configService.get<number>('PORT') || 3000, '0.0.0.0');

  const ip = getLocalIp();

  console.log(
    `Server HTTP: http://${ip}:${configService.get<number>('PORT', 3000)}`,
  );
  console.log('🚀 Microservice MQTT is running...');
}
bootstrap();
