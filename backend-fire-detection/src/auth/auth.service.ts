import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  // Cho phep dang nhap bang username hoac email
  async signIn(identity: string, password: string): Promise<any> {
    if (!identity || !password) {
      throw new BadRequestException(
        'Vui lòng cung cấp tên đăng nhập hoặc email và mật khẩu',
      );
    }

    const user = await this.userService.findForLogin(identity);
    const isPasswordValid = user
      ? await bcrypt.compare(password, user.passwordHash)
      : false;
    if (!user || !isPasswordValid) {
      throw new UnauthorizedException(
        'Tên đăng nhập/email hoặc mật khẩu không đúng',
      );
    }
    // Tra ve thong tin nguoi dung kem token
    const payload: JwtPayload = { username: user.username, sub: user.id };
    return {
      success: true,
      username: user.username,
      access_token: await this.jwtService.signAsync(payload),
    };
  }
}
