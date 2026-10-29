import * as fs from 'node:fs';
import * as path from 'node:path';

function source(relativeFromSpec: string) {
  return fs.readFileSync(path.resolve(__dirname, relativeFromSpec), 'utf8');
}

function methodBody(file: string, start: string, end: string) {
  const startAt = file.indexOf(start);
  const endAt = file.indexOf(end, startAt + start.length);
  expect(startAt).toBeGreaterThanOrEqual(0);
  expect(endAt).toBeGreaterThan(startAt);
  return file.slice(startAt, endAt);
}

describe('Agent task architecture boundary', () => {
  const aiService = source('../ai.service.ts');

  it('keeps manual activity review on the durable activity-review Agent task', () => {
    const body = methodBody(
      aiService,
      'async streamActivityAiAnalysis(',
      'private async resolveSucceededReviewMarkdown(',
    );
    expect(body).toContain('processQueuedActivityAiReview');
    expect(body).toContain('callerManagedOperationId');
    expect(body).not.toContain('chat.completions.create');
  });

  it('keeps plan review composition on a persistent background Agent task', () => {
    const body = methodBody(
      aiService,
      'async generatePlanReviewAdjustment(',
      '\n  }\n}',
    );
    expect(body).toContain('runBackgroundCoachTask');
    expect(body).toContain("activeSkillName: 'plan-review-adjustment'");
    expect(body).not.toContain('chat.completions.create');
  });

  it('keeps anonymous public review on the restricted Agent runner', () => {
    const publicReview = source(
      '../../public/workout-review/public-review-result.ts',
    );
    expect(publicReview).toContain('runAnonymousCoachTask');
    expect(publicReview).toContain('allowedToolNames: []');
    expect(publicReview).not.toContain('chat.completions.create');
  });

  it('does not mount the anonymous marketing review in the public core module', () => {
    const publicModule = source('../../public/public.module.ts');
    expect(publicModule).not.toContain('PublicReviewModule');
  });
});
