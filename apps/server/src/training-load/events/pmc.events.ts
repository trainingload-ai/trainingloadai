import type { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * PMC 跨模块重算事件。只在写入提交之后发出。
 * listener 放在 PMC 模块内；Activity / Import / Coach 不直接调 calculatePMC。
 */
export const PMC_INVALIDATE_EVENT = 'pmc.invalidate';

export class PmcInvalidateEvent {
  constructor(
    public readonly userId: string,
    public readonly startDate?: Date,
    public readonly endDate?: Date,
  ) {}
}

export async function emitPmcInvalidate(
  events: EventEmitter2 | undefined,
  userId: string,
  window?: { startDate: Date; endDate?: Date },
) {
  if (!events) return;
  await events.emitAsync(
    PMC_INVALIDATE_EVENT,
    new PmcInvalidateEvent(userId, window?.startDate, window?.endDate),
  );
}
