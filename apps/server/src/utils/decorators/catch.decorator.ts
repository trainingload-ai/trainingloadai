import { HttpException, InternalServerErrorException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

/**
 * Decorator to wrap a method in a try-catch block and standardize error responses.
 * It rethrows HttpExceptions and converts other errors to InternalServerErrorException with i18n support.
 */
export function CatchAndTranslate() {
  return function (
    target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      try {
        const result = originalMethod.apply(this, args);
        // 判断是否为 Promise，兼容同步和异步
        return result instanceof Promise ? await result : result;
      } catch (error) {
        // Rethrow if it's already an HttpException
        if (error instanceof HttpException) {
          throw error;
        }

        // Get i18n context
        const i18n = I18nContext.current();
        const lang = i18n?.lang;

        // Throw generic InternalServerErrorException with localized message
        throw new InternalServerErrorException(
          i18n?.t('error.common.internal_server_error', { lang }) ||
            'Internal Server Error',
        );
      }
    };

    return descriptor;
  };
}
