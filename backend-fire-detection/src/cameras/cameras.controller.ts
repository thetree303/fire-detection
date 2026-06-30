import {
  Controller,
  Delete,
  UseGuards,
  Get,
  Post,
  Body,
  Param,
  Put,
} from '@nestjs/common';
import { CamerasService } from './cameras.service';
import { User } from '../users/user.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateCameraDto } from './dto/create-camera.dto';
import { UpdateCameraDto } from './dto/update-camera.dto';

@UseGuards(JwtAuthGuard)
@Controller('cameras')
export class CamerasController {
  constructor(private readonly camerasService: CamerasService) {}

  // ENDPOINT LẤY DANH SÁCH TOÀN BỘ CAMERA
  @Get()
  findAll(@CurrentUser() user: User) {
    return this.camerasService.findAll(user);
  }

  // ENDPOINT LẤY DANH SÁCH CAMERA THEO PHÒNG
  @Get(':room_id')
  findByRoom(@Param('room_id') room_id: string, @CurrentUser() user: User) {
    return this.camerasService.findByRoom(Number(room_id), user);
  }

  // ENDPOINT TẠO MỚI CAMERA: Bắt buộc nhập MAC Address kèm thông tin chi tiết
  @Post()
  create(
    @Body()
    data: CreateCameraDto,
    @CurrentUser() user: User,
  ) {
    return this.camerasService.create(data, user);
  }

  // ENDPOINT CẬP NHẬT THÔNG TIN CAMERA THỦ CÔNG TỪ USER
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: number,
    @Body() data: UpdateCameraDto,
    @CurrentUser() user: User,
  ) {
    return this.camerasService.update(id, data, user);
  }

  // ENDPOINT XÓA CAMERA TỪ USER
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  delete(@Param('id') id: number, @CurrentUser() user: User) {
    return this.camerasService.delete(id, user);
  }
}
