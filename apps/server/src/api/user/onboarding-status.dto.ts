import { BadRequestException } from '@nestjs/common';
import { Equals, IsBoolean } from 'class-validator';

export class CompleteOnboardingDto {
  @IsBoolean()
  @Equals(false)
  isNewUser!: false;
}

export function assertOnboardingCompletion(
  isNewUser: unknown,
): asserts isNewUser is false {
  if (isNewUser !== false) {
    throw new BadRequestException('NEW_USER_STATUS_CAN_ONLY_BE_COMPLETED');
  }
}
