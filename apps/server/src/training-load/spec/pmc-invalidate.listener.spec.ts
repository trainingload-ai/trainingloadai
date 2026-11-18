import { describe, expect, it, jest } from '@jest/globals';
import { PmcInvalidateListener } from '../events/pmc-invalidate.listener';
import { PmcInvalidateEvent } from '../events/pmc.events';

describe('PmcInvalidateListener', () => {
  it('recalculates the default window when no startDate is provided', async () => {
    const recalculatePMC = jest.fn(async () => true);
    const calculatePMC = jest.fn(async () => []);
    const listener = new PmcInvalidateListener({
      recalculatePMC,
      calculatePMC,
    } as never);

    await listener.handle(new PmcInvalidateEvent('user-1'));

    expect(recalculatePMC).toHaveBeenCalledWith('user-1', true);
    expect(calculatePMC).not.toHaveBeenCalled();
  });

  it('keeps the import window when startDate is provided', async () => {
    const recalculatePMC = jest.fn(async () => true);
    const calculatePMC = jest.fn(async () => []);
    const listener = new PmcInvalidateListener({
      recalculatePMC,
      calculatePMC,
    } as never);
    const startDate = new Date('2026-08-01T00:00:00.000Z');
    const endDate = new Date('2026-08-18T00:00:00.000Z');

    await listener.handle(new PmcInvalidateEvent('user-1', startDate, endDate));

    expect(calculatePMC).toHaveBeenCalledWith({
      userId: 'user-1',
      startDate,
      endDate,
      requestAthleteStateUpdate: true,
    });
    expect(recalculatePMC).not.toHaveBeenCalled();
  });

  it('can suppress Athlete State side effects without skipping PMC', async () => {
    const recalculatePMC = jest.fn(async () => true);
    const calculatePMC = jest.fn(async () => []);
    const emitAsync = jest.fn(async () => []);
    const listener = new PmcInvalidateListener(
      { recalculatePMC, calculatePMC } as never,
      { emitAsync } as never,
    );
    const startDate = new Date('2026-08-01T00:00:00.000Z');
    const endDate = new Date('2026-08-18T00:00:00.000Z');

    await listener.handle(
      new PmcInvalidateEvent('user-1', startDate, endDate, true),
    );

    expect(calculatePMC).toHaveBeenCalledWith({
      userId: 'user-1',
      startDate,
      endDate,
      requestAthleteStateUpdate: false,
    });
    expect(emitAsync).not.toHaveBeenCalled();
  });
});
