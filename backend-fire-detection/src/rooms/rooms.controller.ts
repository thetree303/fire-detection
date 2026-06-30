import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { Room } from './room.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/user.entity';

@UseGuards(JwtAuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  findAll(@CurrentUser() user: User): Promise<Room[]> {
    return this.roomsService.findAll(user);
  }

  @Post()
  create(
    @Body() data: { name: string; description?: string },
    @CurrentUser() user: User,
  ) {
    return this.roomsService.create(data, user);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() data: Partial<Room>,
    @CurrentUser() user: User,
  ) {
    return this.roomsService.update(Number(id), data, user);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: User) {
    return this.roomsService.delete(Number(id), user);
  }
}
