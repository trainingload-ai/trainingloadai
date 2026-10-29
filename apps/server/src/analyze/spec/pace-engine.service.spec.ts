import { describe, expect, it, jest } from '@jest/globals';
import { PaceEngineService } from '../pace/pace-engine.service';

describe('PaceEngineService', () => {
  it('把无速度样本视为可预期跳过而不是运行错误', () => {
    const service = new PaceEngineService();
    const debug = jest.fn();
    const error = jest.fn();
    (service as unknown as { logger: unknown }).logger = {
      debug,
      error,
      log: jest.fn(),
    };

    expect(
      service.computePaceInternals([
        { speed: 0, enhancedSpeed: 0 },
        { speed: undefined, enhancedSpeed: Number.NaN },
      ] as never),
    ).toBeNull();

    expect(debug).toHaveBeenCalledWith('[分析 pace] 跳过，未发现有效速度数据');
    expect(error).not.toHaveBeenCalled();
  });

  it('空记录同样按可预期跳过处理', () => {
    const service = new PaceEngineService();
    const debug = jest.fn();
    const error = jest.fn();
    (service as unknown as { logger: unknown }).logger = {
      debug,
      error,
      log: jest.fn(),
    };

    expect(service.computePaceInternals([])).toBeNull();
    expect(debug).toHaveBeenCalledWith('[分析 pace] 跳过，没有传感器数据');
    expect(error).not.toHaveBeenCalled();
  });

  it('按真实时间计算平均配速，并要求标准化配速窗口完整', () => {
    const service = new PaceEngineService();
    const rows = Array.from({ length: 61 }, (_, second) => {
      const speed = second < 30 ? 2 : 4;
      return {
        time: new Date(second * 1000).toISOString(),
        tMs: second * 1000,
        distance: String(second * speed),
        speed,
        gap: 1 / speed,
      };
    });

    const result = service.computePaceInternals(rows);
    expect(result?.base.avgSpeed).toBe(3);
    expect(result?.base.avgGap).toBeCloseTo(1 / 3, 6);
    expect(result?.base.xPace).toBeGreaterThan(0);
    expect(result?.base.xGap).toBe(result?.base.xPace);
  });
});
