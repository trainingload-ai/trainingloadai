import { ValidationPipe } from '@nestjs/common';

export function createGlobalValidationPipe() {
  return new ValidationPipe({
    transform: true,
    forbidUnknownValues: false,
    validationError: { target: false, value: false },
  });
}
