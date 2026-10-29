import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';

function normalizeHashId(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : null;
}

/**
 * 获取路由参数 `:hashId`（空值则抛出统一的 i18n 错误）。
 */
export const ActivityHashId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest();
    const hashId = normalizeHashId(req?.params?.hashId);
    if (hashId) return hashId;

    const i18n = I18nContext.current();
    throw new BusinessException({
      code: BUSINESS_ERROR_CODE.COMMON,
      message:
        i18n?.t('common.error.activity_hash_id_cannot_be_empty', {
          lang: i18n.lang,
        }) ?? 'Activity hashId cannot be empty',
    });
  },
);
