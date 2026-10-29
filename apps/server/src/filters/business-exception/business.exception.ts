import { HttpException, HttpStatus } from '@nestjs/common';
import { BUSINESS_ERROR_CODE } from './business-exception.error.codes';

export type BusinessError = {
  code: number;
  message: string;
};

export class BusinessException extends HttpException {
  constructor(err: BusinessError) {
    super(err, HttpStatus.OK);
  }
}
