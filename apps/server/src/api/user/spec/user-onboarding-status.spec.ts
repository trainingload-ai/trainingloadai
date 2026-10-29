import { describe, expect, it } from '@jest/globals';
import { validate } from 'class-validator';
import {
  assertOnboardingCompletion,
  CompleteOnboardingDto,
} from '../onboarding-status.dto';

describe('UsersController onboarding completion boundary', () => {
  it('never lets an authenticated user mark itself as new again', () => {
    expect(() => assertOnboardingCompletion(true)).toThrow(
      'NEW_USER_STATUS_CAN_ONLY_BE_COMPLETED',
    );
  });

  it('accepts only the one-way false transition at runtime', () => {
    expect(() => assertOnboardingCompletion(false)).not.toThrow();
    expect(() => assertOnboardingCompletion(undefined)).toThrow(
      'NEW_USER_STATUS_CAN_ONLY_BE_COMPLETED',
    );
  });

  it('also rejects true through request validation', async () => {
    const body = new CompleteOnboardingDto();
    Object.assign(body, { isNewUser: true });

    await expect(validate(body)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'isNewUser',
          constraints: expect.objectContaining({ equals: expect.any(String) }),
        }),
      ]),
    );
  });
});
