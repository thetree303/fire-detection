import { Controller, Post, Body } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Public() // Cho phép bypass Auth Guard
  @Post('test')
  async sendTestNotification(
    @Body() body: { fcmToken: string; message: string; cameraId: string },
  ) {
    const alertData = {
      cameraName: 'Camera Test',
      cameraId: body.cameraId,
      imageUrl: 'https://via.placeholder.com/150', // Ảnh demo
    };

    await this.notificationsService.sendFireAlert([body.fcmToken], alertData);
    return { success: true, message: 'Đã gửi thông báo test!' };
  }
}
