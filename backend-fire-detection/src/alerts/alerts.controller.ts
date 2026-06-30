import {
  Controller,
  Param,
  Get,
  Put,
  Delete,
  UseGuards,
  Logger,
  Query,
  Headers,
  MethodNotAllowedException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GetAlertsQueryDto } from './dto/get-alerts-query.dto';
import { GetCameraAlertsQueryDto } from './dto/get-camera-alerts-query.dto';
import { User } from '../users/user.entity';

@UseGuards(JwtAuthGuard)
@Controller('alerts')
export class AlertsController {
  private readonly logger = new Logger(AlertsController.name);

  constructor(
    private readonly alertsService: AlertsService,
    private readonly configService: ConfigService,
  ) { }

  @Get()
  async findAll(
    @Query() query: GetAlertsQueryDto,
    @CurrentUser() user: User,
  ) {
    return await this.alertsService.findAll(user, query);
  }

  @Get('/camera/:cameraId')
  async findByCamera(
    @Param('cameraId') cameraId: number,
    @Query() query: GetCameraAlertsQueryDto,
  ) {
    return await this.alertsService.findByCamera(Number(cameraId), query);
  }

  @Put('/handle/:id')
  async resolveAlert(@Param('id') alertId: number) {
    const result = await this.alertsService.update(Number(alertId), {
      isResolved: true,
    });
    if (result) {
      this.logger.log(`Alert ${alertId} has been resolved`);
      return { message: `Xác nhận an toàn cảnh báo ${alertId} thành công` };
    }
    this.logger.error(`Failed to resolve alert ${alertId}`);
    return { message: `Xác nhận an toàn cảnh báo ${alertId} không thành công` };
  }

  @Put('/handle-all')
  async resolveAllAlerts(@CurrentUser() user: User) {
    const count = await this.alertsService.resolveAllAlerts(user);
    this.logger.log(`User ${user.id} resolved ${count} alerts`);
    return { message: `Đã xác nhận an toàn ${count} cảnh báo thành công`, count };
  }

  @Delete('/testing/purge-all')
  async purgeAllAlerts(@Headers('x-test-bypass-key') bypassKey: string) {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    if (nodeEnv === 'production') {
      throw new MethodNotAllowedException('Endpoint not available in production');
    }

    if (bypassKey !== 'SECRET_TEST_BYPASS_KEY_2026') {
      throw new UnauthorizedException('Secret bypass key not valid');
    }

    await this.alertsService.purgeAllAlertsAndFiles();
    this.logger.log(`Deleted all alerts and cleaned up files`);
    return { message: 'Đã xóa toàn bộ cảnh báo và dọn dẹp file thành công' };
  }
}
