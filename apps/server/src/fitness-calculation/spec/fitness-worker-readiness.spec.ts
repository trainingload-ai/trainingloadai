import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { FitnessAssessmentFollowupService } from '@/api/ai/fitness-assessment-followup.service';

const originalEnabled = process.env.FITNESS_ASSESSMENT_ENABLED;
afterEach(() => {
  if (originalEnabled === undefined)
    delete process.env.FITNESS_ASSESSMENT_ENABLED;
  else process.env.FITNESS_ASSESSMENT_ENABLED = originalEnabled;
  jest.restoreAllMocks();
});
function fixture() {
  const prisma = {
    $queryRaw: jest.fn(async () => [{ ready: false }]),
    fitnessCalculation: {
      findMany: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };
  const events = { emitAsync: jest.fn(async () => []) };
  const service = new FitnessAssessmentFollowupService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    events as never,
    {} as never,
    {} as never,
    { t: (key: string) => key } as never,
  );
  return { prisma, events, service };
}
describe('fitness worker before and after the expand migration', () => {
  it.each(['true', 'false'])(
    'does not query unmigrated tables when enabled=%s and warns once',
    async (enabled) => {
      process.env.FITNESS_ASSESSMENT_ENABLED = enabled;
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => {});
      const { prisma, service } = fixture();
      await service.tick();
      await service.tick();
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
      expect(prisma.fitnessCalculation.findMany).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain(
        '20260925000000_fitness_assessment',
      );
    },
  );
  it('automatically resumes after migration without dropping committed work when the feature is disabled', async () => {
    process.env.FITNESS_ASSESSMENT_ENABLED = 'false';
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => {});
    const { prisma, service, events } = fixture();
    await service.tick();
    prisma.$queryRaw.mockResolvedValue([{ ready: true }]);
    prisma.fitnessCalculation.findMany.mockResolvedValueOnce([
      {
        id: 'committed',
        userId: 'fixture',
        appliedOptionId: 'option',
        result: {
          applyOptions: [
            {
              id: 'option',
              sport: 'RUN',
              effectiveDate: '2026-09-25',
              changes: [{ metric: 'LTHR' }],
            },
          ],
        },
      },
    ]);
    await service.tick();
    expect(events.emitAsync).toHaveBeenCalledTimes(1);
    expect(prisma.fitnessCalculation.updateMany).toHaveBeenCalledWith({
      where: { id: 'committed', postProcessState: 'PENDING' },
      data: { postProcessState: 'DONE' },
    });
    expect(prisma.fitnessCalculation.findMany).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      'Fitness assessment worker resumed after migration',
    );
  });
  it('preserves unrelated database failures instead of reporting them as missing migrations', async () => {
    const { prisma, service } = fixture();
    const error = new Error('database connection refused');
    prisma.$queryRaw.mockRejectedValue(error);
    await expect(service.tick()).rejects.toBe(error);
    expect(prisma.fitnessCalculation.findMany).not.toHaveBeenCalled();
  });
});
