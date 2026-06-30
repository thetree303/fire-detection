import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    console.log('Origin header received:', req.headers['origin']);
    next(); // Chuyển tiếp tới handler tiếp theo
  }
}
