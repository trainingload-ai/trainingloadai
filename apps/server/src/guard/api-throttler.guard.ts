import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  deploymentThrottlingPolicy,
  type ThrottlingRequest,
} from './deployment-throttling-policy';

export function isGloballyThrottledApiPath(url: string): boolean {
  return (
    url.startsWith('/public') ||
    url.startsWith('/demo') ||
    url.startsWith('/ai') ||
    url.startsWith('/api/self-host/bootstrap') ||
    url.startsWith('/users/data-exports') ||
    Boolean(deploymentThrottlingPolicy(url))
  );
}

@Injectable()
export class ApiThrottlerGuard extends ThrottlerGuard {
  /**
   * 是否启用限流
   *
   * 规则：
   * - 对 Core 高成本接口及当前部署显式登记的扩展接口生效
   * - 其它业务接口不做全局限流，避免误伤
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { req } = this.getRequestResponse(context);
    const url = String(req?.originalUrl || req?.url || '');

    if (!isGloballyThrottledApiPath(url)) {
      return true;
    }
    return super.canActivate(context);
  }

  /**
   * 获取限流 key（用于区分不同请求来源）
   *
   * 规则：
   * - `/ai`、数据导出和部署扩展接口：优先按用户维度限流
   * - `/public`、`/demo`：回退使用 Throttler 默认策略（通常是 IP）
   */
  protected async getTracker(
    req: Record<string, unknown> & {
      originalUrl?: string;
      url?: string;
      ip?: string;
      headers?: Record<string, unknown>;
      session?: { user?: { id?: unknown } };
      user?: { id?: unknown };
      auth?: { user?: { id?: unknown } };
      publicDemo?: { subject?: unknown };
    },
  ): Promise<string> {
    const url = String(req?.originalUrl || req?.url || '');
    if (req?.publicDemo?.subject === 'demo_guest') {
      const ip = req?.ip ?? req?.headers?.['x-forwarded-for'] ?? 'unknown';
      return `demo-ip:${String(ip)}`;
    }
    const deploymentPolicy = deploymentThrottlingPolicy(url);
    const deploymentTracker = deploymentPolicy?.tracker?.(
      req as ThrottlingRequest,
      url,
    );
    if (deploymentTracker) return deploymentTracker;
    if (
      url.startsWith('/ai') ||
      url.startsWith('/users/data-exports') ||
      Boolean(deploymentPolicy)
    ) {
      const userId =
        req?.session?.user?.id ?? req?.user?.id ?? req?.auth?.user?.id ?? null;
      if (userId) return `u:${String(userId)}`;
      // 理论上 `/ai` 需要登录，这里只是兜底，避免返回空 key
      const ip = req?.ip ?? req?.headers?.['x-forwarded-for'] ?? 'unknown';
      return `ip:${String(ip)}`;
    }
    return super.getTracker(req);
  }
}
