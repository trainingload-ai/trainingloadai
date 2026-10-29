import { describe, expect, it } from '@jest/globals';
import { competitionEventMutationTool } from '../mutationCompetitionEvent.tool';

describe('mutation_competition_event delete contract', () => {
  it('accepts a confirmed delete with an event id and optimistic version', async () => {
    await expect(competitionEventMutationTool.validateInput!({} as never, {
      action: 'DELETE',
      userConfirmed: true,
      eventId: 'event-1',
      expectedVersion: 3,
    })).resolves.toEqual({ ok: true });
  });

  it('rejects delete without explicit confirmation', async () => {
    const result = await competitionEventMutationTool.validateInput!({} as never, {
      action: 'DELETE',
      userConfirmed: false,
      eventId: 'event-1',
      expectedVersion: 3,
    });
    expect(result).toMatchObject({ ok: false, code: 'CONFIRMATION_REQUIRED' });
  });
});
