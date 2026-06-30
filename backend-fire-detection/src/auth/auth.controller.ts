import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { SignInDto } from './dto/sign-in.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async signIn(
    @Body() signInDto: SignInDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.signIn(
      signInDto.identity,
      signInDto.password,
    );

    // Đặt JWT vào httpOnly cookie — không bị JavaScript đọc (chống XSS)
    res.cookie('access_token', result.access_token, {
      httpOnly: true,
      secure: false, // Đổi thành true khi dùng HTTPS
      sameSite: 'lax',
      maxAge: 3_600_000, // 1 giờ (ms)
    });

    // Trả về thông tin người dùng, KHÔNG trả về token trong body
    return {
      success: true,
      username: result.username,
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token');
    return { success: true, message: 'Đăng xuất thành công' };
  }
}
