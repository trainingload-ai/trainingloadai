import { CoachAssessmentOrchestratorService } from '../coach-assessment-orchestrator.service';

function fixture() {
  const ai = {
    runBackgroundCoachTask: jest.fn(async (_input: Record<string, any>) => ({
      result: { assessmentId: 'saved', state: 'STABLE', confidence: 0.8 },
    })),
  };
  const users = { getPreferredLocale: jest.fn(async () => 'en') };
  const flags = {
    evidenceEnabled: () => true,
    assessmentShadowEnabled: () => true,
    homeInquiryEnabled: () => true,
  };
  const updates = {
    eligibility: jest.fn(async () => null as string | null),
    requestUpdate: jest.fn(),
  };
  return {
    ai,
    users,
    flags,
    updates,
    service: new CoachAssessmentOrchestratorService(
      ai as never,
      users as never,
      flags as never,
      updates as never,
    ),
  };
}
describe('Athlete State scheduling adapter', () => {
  it('runs one platform-funded Skill with persisted history and no preassembled evidence or Case scope', async () => {
    const f = fixture();
    await f.service.assess({
      userId: 'athlete',
      triggerType: 'HEALTH_FACT_CHANGED',
      requestVersion: 4,
    });
    expect(f.ai.runBackgroundCoachTask).toHaveBeenCalledTimes(1);
    expect(f.ai.runBackgroundCoachTask).toHaveBeenCalledWith(
      expect.objectContaining({
        activeSkillName: 'athlete-state',
        taskType: 'ATHLETE_STATE_UPDATE',
        funding: 'PLATFORM',
        resumeHistory: true,
        allowUserInteraction: true,
        resultToolName: 'athlete_state.answer',
        dedupeKey: 'state-update:4',
        allowedToolNames: expect.arrayContaining([
          'plan.execution_context',
          'memory.search',
          'ask_user_question',
        ]),
      }),
    );
    expect(
      f.ai.runBackgroundCoachTask.mock.calls[0][0].instructions,
    ).not.toContain('evidenceSnapshot');
  });
  it('checks eligibility before loading locale or invoking the runtime', async () => {
    const f = fixture();
    f.updates.eligibility.mockResolvedValue('AI_DATA_CONSENT_REQUIRED');
    expect(
      await f.service.assess({ userId: 'athlete', triggerType: 'UPDATE' }),
    ).toMatchObject({ skipped: true });
    expect(f.users.getPreferredLocale).not.toHaveBeenCalled();
    expect(f.ai.runBackgroundCoachTask).not.toHaveBeenCalled();
  });
  it('removes the question tool when homepage inquiries are disabled', async () => {
    const f = fixture();
    f.flags.homeInquiryEnabled = () => false;
    await f.service.assess({ userId: 'athlete', triggerType: 'UPDATE' });
    const input = f.ai.runBackgroundCoachTask.mock.calls[0][0];
    expect(input.allowUserInteraction).toBe(false);
    expect(input.allowedToolNames).not.toContain('ask_user_question');
  });
});
