import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { UserStatus } from '../../users/enums/user-status.enum';
import { User } from '../../users/user.entity';
import { UnauthorizedException } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    // [FIX #6] Bắt buộc phải có JWT_SECRET, throw Error nếu không có
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error(
        '[JWT] JWT_SECRET is not defined! Please set it in your environment variables.',
      );
    }
    super({
      // Đọc JWT từ httpOnly cookie thay vì Authorization header
      jwtFromRequest: (req) => req?.cookies?.access_token ?? null,
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.usersService.findOne(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.status === UserStatus.DELETED) {
      throw new UnauthorizedException('User is deleted');
    }

    return user;
  }
}
