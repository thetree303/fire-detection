import {
  Controller,
  Body,
  Get,
  Post,
  Put,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from './user.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() userData: CreateUserDto) {
    return this.usersService.create(userData);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findOne(@CurrentUser() user: User) {
    return this.usersService.findOne(user.id);
  }

  // Cập nhật FCM token của user hiện tại
  @UseGuards(JwtAuthGuard)
  @Put('fcm-token')
  updateFcmToken(
    @CurrentUser() user: User,
    @Body() body: { token: string | null },
  ) {
    return this.usersService.updateFcmToken(user.id, body.token ?? null);
  }

  // Xóa FCM token của user hiện tại
  @UseGuards(JwtAuthGuard)
  @Delete('fcm-token')
  removeFcmToken(
    @CurrentUser() user: User,
    @Body() body: { token: string },
  ) {
    return this.usersService.removeFcmToken(user.id, body.token);
  }

  @UseGuards(JwtAuthGuard)
  @Put()
  update(@CurrentUser() user: User, @Body() updateData: UpdateUserDto) {
    return this.usersService.update(user.id, updateData);
  }

  // Soft delete
  @UseGuards(JwtAuthGuard)
  @Delete()
  softDelete(@CurrentUser() user: User) {
    return this.usersService.softDelete(user.id);
  }
}
