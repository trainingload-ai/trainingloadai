import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PublicService } from '../public.service';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';

function i18nStub() {
  return {
    t: (key: string) => key,
  } as never;
}

describe('PublicService.encodeWorkoutFromText', () => {
  const parsePlanText = jest.fn<(text: string) => unknown[]>();
  const buildFITFromPlan = jest.fn<(
    blocks: unknown[],
    options?: { sport?: string; name?: string; subSport?: string },
  ) => Promise<Uint8Array>>();
  const service = new PublicService(i18nStub(), {
    parsePlanText,
    buildFITFromPlan,
  } as never);

  beforeEach(() => {
    parsePlanText.mockReset();
    buildFITFromPlan.mockReset();
  });

  it('encodes a structured workout FIT via WorkoutService', async () => {
    const blocks = [{ type: 'work', steps: [{ duration: 240 }] }];
    parsePlanText.mockReturnValue(blocks);
    buildFITFromPlan.mockResolvedValue(
      Uint8Array.from([14, 16, 0, 0, 0, 0, 0, 0, 46, 70, 73, 84]),
    );

    const result = await service.encodeWorkoutFromText({
      text: [
        'warmup 5m',
        'repeat 3 {',
        '  work 4m power 270W',
        '  recovery 2m',
        '}',
        'cooldown 5m',
      ].join('\n'),
      sport: 'cycling',
      name: 'VO2 Intervals',
    });

    expect(parsePlanText).toHaveBeenCalledWith(expect.stringContaining('work 4m power 270W'));
    expect(buildFITFromPlan).toHaveBeenCalledWith(
      blocks,
      expect.objectContaining({
        sport: 'cycling',
        name: 'VO2 Intervals',
      }),
    );
    expect(result.filename).toBe('VO2 Intervals.fit');
    expect(result.content.subarray(8, 12).toString('ascii')).toBe('.FIT');
  });

  it('maps strength to a generic FIT sport and uses a fallback name', async () => {
    parsePlanText.mockReturnValue([{ type: 'work', steps: [{ duration: 1200 }] }]);
    buildFITFromPlan.mockResolvedValue(Uint8Array.from([1, 2, 3, 4]));

    const result = await service.encodeWorkoutFromText({
      text: 'work 20m',
      sport: 'strength',
    });

    expect(buildFITFromPlan).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        sport: 'generic',
        name: 'Trainingload Workout',
      }),
    );
    expect(result.filename).toBe('Trainingload Workout.fit');
  });

  it('rejects empty text', async () => {
    await expect(
      service.encodeWorkoutFromText({ text: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid Workout DSL without leaking a 200 BusinessException', async () => {
    parsePlanText.mockImplementation(() => {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: 'Line 1 unable to parse: this is not a workout step',
      });
    });

    const error = await service
      .encodeWorkoutFromText({ text: 'this is not a workout step' })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'WORKOUT_DSL_INVALID',
    });
  });
});
