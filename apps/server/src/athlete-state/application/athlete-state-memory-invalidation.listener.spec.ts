import { describe, expect, it, jest } from '@jest/globals';
import { AthleteStateMemoryInvalidationListener } from './athlete-state-memory-invalidation.listener';

describe('AthleteStateMemoryInvalidationListener', () => {
  it('does not invalidate the Case for a Memory projection of its own answer', async () => {
    const commands = {
      isAssessmentAnswerSource: jest.fn(async () => true),
      invalidate: jest.fn(),
    };
    const events = { emitAsync: jest.fn() };
    const listener = new AthleteStateMemoryInvalidationListener(
      commands as never,
      events as never,
    );

    await listener.handle({
      userId: 'athlete-1',
      change: 'CREATED',
      sourceMessageId: 'answer-message-1',
      occurredAt: '2026-10-12T12:00:00.000Z',
    });

    expect(commands.isAssessmentAnswerSource).toHaveBeenCalledWith(
      'athlete-1',
      'answer-message-1',
    );
    expect(commands.invalidate).not.toHaveBeenCalled();
    expect(events.emitAsync).not.toHaveBeenCalled();
  });

  it('invalidates and requests reassessment for independent Memory changes', async () => {
    const commands = {
      isAssessmentAnswerSource: jest.fn(async () => false),
      invalidate: jest.fn(async () => ({ assessments: 1, cases: 1 })),
    };
    const events = { emitAsync: jest.fn(async () => []) };
    const listener = new AthleteStateMemoryInvalidationListener(
      commands as never,
      events as never,
    );

    await listener.handle({
      userId: 'athlete-1',
      change: 'CORRECTED',
      occurredAt: '2026-10-12T12:00:00.000Z',
    });

    expect(commands.invalidate).toHaveBeenCalledWith('athlete-1');
    expect(events.emitAsync).toHaveBeenCalledWith(
      'athlete-state.reassess-requested.v1',
      expect.objectContaining({
        userId: 'athlete-1',
        triggerType: 'MEMORY_CHANGED',
        triggerRef: 'CORRECTED',
      }),
    );
  });
});
