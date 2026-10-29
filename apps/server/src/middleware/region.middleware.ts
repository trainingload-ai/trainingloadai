import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

// 扩展 Request 接口以包含 region 属性
export interface RegionRequest extends Request {
  region?: 'china' | 'international';
}

@Injectable()
export class RegionMiddleware implements NestMiddleware {
  use(req: RegionRequest, res: Response, next: NextFunction): void {
    // 从请求头中获取 X-Region 信息
    const regionHeader = req.headers['x-region'] as string;

    if (regionHeader === 'china') {
      req.region = 'china';
    } else if (regionHeader === 'international') {
      req.region = 'international';
    } else {
      // 默认为国际版
      req.region = 'international';
    }

    next();
  }
}
