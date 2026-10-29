import { describe, expect, it, jest } from '@jest/globals';
import { SportType } from '@prisma/client';
import type { MetricsContext } from '../metrics/context';
import type { MetricsTask } from '../metrics/task';
import {
  ActivityMetricsOrchestratorService,
  ActivityMetricsPipelineError,
} from '../metrics/orchestrator.service';

function context(): MetricsContext {
  return {
    inputs: {
      activity: { id: 42 } as MetricsContext['inputs']['activity'],
      userId: 'user-1',
      sportType: 'RUN' as MetricsContext['inputs']['sportType'],
    },
    cache: {},
    outputs: {},
    errors: {},
  };
}

function task(key: MetricsTask['key'], exec: MetricsTask['exec']): MetricsTask {
  return {
    key,
    pre: async (ctx) => ctx,
    exec,
    post: async (ctx) => ctx,
  };
}

describe('ActivityMetricsOrchestratorService', () => {
  it('默认收集 task 异常并继续执行后续指标', async () => {
    const laterTask = jest.fn(async (ctx: MetricsContext) => ctx);
    const service = new ActivityMetricsOrchestratorService();

    const result = await service.run(context(), [
      task('recordsBootstrap', async () => {
        throw new Error('parquet unavailable');
      }),
      task('calories', laterTask),
    ]);

    expect(laterTask).toHaveBeenCalledTimes(1);
    expect(result.errors.recordsBootstrap?.message).toBe('parquet unavailable');
    expect(result.taskOutcomes?.recordsBootstrap).toEqual({
      key: 'recordsBootstrap',
      status: 'FAILED',
      reason: 'parquet unavailable',
    });
  });

  it('无可用输入时记录 SKIPPED 和具体原因', async () => {
    const service = new ActivityMetricsOrchestratorService();

    const result = await service.run(context(), [
      task('heartRateBase', async (ctx) => ctx),
      task('powerBase', async (ctx) => ctx),
    ]);

    expect(result.taskOutcomes).toEqual(
      expect.objectContaining({
        heartRateBase: {
          key: 'heartRateBase',
          status: 'SKIPPED',
          reason: 'no_sensor_records',
        },
        powerBase: {
          key: 'powerBase',
          status: 'SKIPPED',
          reason: 'no_sensor_records',
        },
      }),
    );
  });

  it('task 产生指标输出时记录 APPLIED', async () => {
    const service = new ActivityMetricsOrchestratorService();

    const result = await service.run(context(), [
      task('calories', async (ctx) => ({
        ...ctx,
        outputs: {
          ...ctx.outputs,
          calories: { calories: 321, fatCalories: 42 },
        },
      })),
    ]);

    expect(result.taskOutcomes?.calories).toEqual({
      key: 'calories',
      status: 'APPLIED',
    });
  });

  it('运动类型不适用时记录 IGNORED 而不是 SKIPPED', async () => {
    const service = new ActivityMetricsOrchestratorService();
    const input = context();
    input.inputs.activity.sportType = SportType.SWIM;

    const result = await service.run(input, [
      task('powerBase', async (ctx) => ctx),
    ]);

    expect(result.taskOutcomes?.powerBase).toEqual({
      key: 'powerBase',
      status: 'IGNORED',
      reason: 'not_applicable_for_sport',
    });
  });

  it('严格模式执行完后续指标后统一抛出 task 异常', async () => {
    const laterTask = jest.fn(async (ctx: MetricsContext) => ctx);
    const service = new ActivityMetricsOrchestratorService();

    let thrown: unknown;
    try {
      await service.runStrict(context(), [
        task('recordsBootstrap', async () => {
          throw new Error('parquet unavailable');
        }),
        task('calories', laterTask),
      ]);
    } catch (error) {
      thrown = error;
    }

    expect(laterTask).toHaveBeenCalledTimes(1);
    expect(thrown).toBeInstanceOf(ActivityMetricsPipelineError);
    expect((thrown as ActivityMetricsPipelineError).taskErrors).toEqual(
      expect.objectContaining({
        recordsBootstrap: expect.objectContaining({
          message: 'parquet unavailable',
        }),
      }),
    );
    expect((thrown as Error).message).toContain('recordsBootstrap');
  });

  it('原始功率不可靠时跳过整条功率衍生任务链', async () => {
    const exec = jest.fn(async (ctx: MetricsContext) => ctx);
    const service = new ActivityMetricsOrchestratorService();
    const input = context();
    input.inputs.measuredPowerEvidence = 'INSUFFICIENT';

    const result = await service.run(input, [
      task('maxMeanPower', exec),
      task('estimatedPowerMetrics', exec),
      task('powerBase', exec),
      task('powerCogganBike', exec),
    ]);

    expect(exec).not.toHaveBeenCalled();
    expect(result.taskOutcomes).toEqual(
      expect.objectContaining({
        maxMeanPower: {
          key: 'maxMeanPower',
          status: 'SKIPPED',
          reason: 'no_reliable_measured_power',
        },
        estimatedPowerMetrics: {
          key: 'estimatedPowerMetrics',
          status: 'SKIPPED',
          reason: 'no_reliable_measured_power',
        },
        powerCogganBike: {
          key: 'powerCogganBike',
          status: 'SKIPPED',
          reason: 'no_reliable_measured_power',
        },
      }),
    );
  });
});
