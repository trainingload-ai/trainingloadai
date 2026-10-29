import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';

/**
 * 从请求中解析当前数据作用域的用户 id。
 *
 * 正常请求来自登录 session/OAuth；公开 Demo 请求来自 guard 映射的固定
 * data owner。调用方不应据此推断访问者已经登录。
 */
function resolveUserIdFromRequest(req: {
  session?: { user?: { id?: unknown } };
  user?: { id?: unknown };
  auth?: { user?: { id?: unknown } };
  request?: { session?: { user?: { id?: unknown } } };
}): string | null {
  const id =
    req?.session?.user?.id ??
    req?.user?.id ??
    req?.auth?.user?.id ??
    req?.request?.session?.user?.id ??
    null;
  const s = typeof id === 'string' ? id.trim() : '';
  return s ? s : null;
}

/**
 * 获取当前数据作用域用户 id（拿不到则直接抛未授权异常）。
 *
 * 用途：减少 controller 里重复的 `if (!session?.user?.id) throw ...` 样板代码。
 */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest();
    const userId = resolveUserIdFromRequest(req);
    if (userId) return userId;

    const i18n = I18nContext.current();
    throw new BusinessException({
      code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
      message:
        i18n?.t('common.error.current_user_not_logged_in', {
          lang: i18n.lang,
        }) ?? 'Unauthorized',
    });
  },
);
