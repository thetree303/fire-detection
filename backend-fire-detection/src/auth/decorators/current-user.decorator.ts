/**
 * Custom decorator để lấy thông tin người dùng hiện tại từ token JWT đã được xác thực bởi JwtStrategy.
 * Sử dụng @CurrentUser() trong controller để truy cập thông tin người dùng đã đăng nhập.
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../../users/user.entity';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest();
    return request.user; // Thông tin người dùng đã được gắn vào request bởi JwtStrategy
  },
);
