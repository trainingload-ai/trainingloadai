import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { I18nContext } from 'nestjs-i18n';
import { Reflector } from '@nestjs/core';
import { RAW_RESPONSE_METADATA } from './response-envelope';

interface Data<T> {
  code: number;
  message: string;
  data: T;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Data<T> | T> {
    const rawResponse = this.reflector.getAllAndOverride<boolean>(
      RAW_RESPONSE_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (rawResponse) return next.handle();

    const i18n = I18nContext.current(context);
    return next.handle().pipe(
      map((data) => {
        if (data instanceof Error) {
          throw data;
        } else {
          const translated =
            i18n?.t('common.response.success') || 'Request succeeded';
          return {
            code: HttpStatus.OK,
            message: translated,
            data,
          };
        }
      }),
    );
  }
}
