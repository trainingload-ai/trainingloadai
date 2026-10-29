import { Logger } from '@nestjs/common';

/**
 * Decorator to log method execution and errors.
 *
 * @param options.context Optional context name for logging (defaults to method name)
 */
export function Log(options?: { context?: string }) {
  return function (
    target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const logger = this.logger || new Logger(target.constructor.name);
      const methodName = propertyKey;
      const contextName = options?.context || methodName;

      try {
        // 如有需要可开启入口日志：logger.log(`[${contextName}] 开始执行`);
        const result = originalMethod.apply(this, args);
        // 判断是否为 Promise，兼容同步和异步
        return result instanceof Promise ? await result : result;
      } catch (error) {
        // Log the error
        logger.error(
          `[${contextName}] 执行失败：${
            error instanceof Error ? error.message : String(error)
          }`,
          error instanceof Error ? error.stack : undefined,
        );
        throw error; // Rethrow for the next decorator (e.g. Catch) to handle
      }
    };

    return descriptor;
  };
}
