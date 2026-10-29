export const ATHLETE_MEMORY_CHANGED_EVENT = 'athlete-memory.changed.v1';

type AsyncEventPublisher = {
  emitAsync(event: string, payload: unknown): Promise<unknown>;
};

export type AthleteMemoryChangedEvent = {
  userId: string;
  change: 'CREATED' | 'CORRECTED' | 'DELETED' | 'CLEARED' | 'RETRACTED';
  factIds?: string[];
  sourceMessageId?: string;
  occurredAt: string;
};

export async function emitAthleteMemoryChanged(
  events: AsyncEventPublisher | undefined,
  event: Omit<AthleteMemoryChangedEvent, 'occurredAt'>,
) {
  if (!events) return;
  await events.emitAsync(ATHLETE_MEMORY_CHANGED_EVENT, {
    ...event,
    occurredAt: new Date().toISOString(),
  } satisfies AthleteMemoryChangedEvent);
}
