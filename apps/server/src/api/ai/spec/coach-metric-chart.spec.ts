import { describe, expect, it, jest } from '@jest/globals';
import { AiService } from '../ai.service';
import { buildActivityTrainingDataset, buildTrainingVisualization } from '../core/training-analytics';
import { buildStoredCoachUiMessageEnvelope } from '../core/coach-history-messages';
import type { TrainingAnalysisQuery } from '@shared/training-visualization';

function setup(overrides?: Partial<TrainingAnalysisQuery>) {
  const query: TrainingAnalysisQuery = {
    source: 'ACTIVITIES', from: '2026-11-21', to: '2026-11-22', groupBy: 'DAY',
    sportTypes: ['RUN'], measures: ['AVG_HEART_RATE'], limit: 12,
    ...overrides,
  };
  const activities = [
    {
      hashId: 'measured', activityName: 'Run', sportType: 'RUN' as const,
      startTime: new Date('2026-11-21T02:00:00Z'), timerTime: 2400,
      elapsedTime: null, distance: 7000, avgHeartRate: 142.5, avgPower: null,
    },
    {
      hashId: 'without-signal', activityName: 'Easy run', sportType: 'RUN' as const,
      startTime: new Date('2026-11-22T02:00:00Z'), timerTime: 1200,
      elapsedTime: null, distance: null, avgHeartRate: null, avgPower: null,
    },
  ];
  const timezone = 'Asia/Shanghai';
  const dataset = buildActivityTrainingDataset({
    query: { ...query, source: 'ACTIVITIES', measures: ['AVG_HEART_RATE'], metricSource: undefined },
    timezone, activities, truncated: false,
  });
  dataset.query = query;
  const snapshot = buildTrainingVisualization({ dataset, intent: 'LOOKUP', title: 'Heart rate' });
  const message = buildStoredCoachUiMessageEnvelope({
    role: 'assistant', content: '', message: { content: [{
      type: 'tool_use', id: 'chart-1', name: 'TrainingVisualization', input: {
        ...snapshot, rows: [], detail: { limit: query.limit }, observedAt: '2026-11-22T13:00:00Z',
      },
    }] },
  });
  const findFirst = jest.fn(async ({ where }: { where: { userId: string } }) =>
    where.userId === 'athlete' ? { message } : null,
  );
  const trainingAggregate = jest.fn(async (_context: unknown, request: TrainingAnalysisQuery) => {
    if (request.source === 'METRICS') {
      const value = request.metricSource === 'MANUAL' ? 52 : request.metricSource === 'ESTIMATED' ? 46 : null;
      return { ...dataset, query: request, summary: { VO2_MAX: value } };
    }
    return buildActivityTrainingDataset({ query: request, timezone, activities, truncated: false });
  });
  const isGranted = jest.fn(async () => true);
  const service = Object.assign(Object.create(AiService.prototype) as AiService, {
    aiDataConsent: { isGranted }, prisma: { aiCoachMessage: { findFirst } },
    coachTools: { trainingAggregate },
  });
  return { service, findFirst, trainingAggregate, isGranted, query, timezone, snapshot };
}

describe('reopening a coach chart from persisted delivery', () => {
  it('reuses the delivered scope for a partial result', async () => {
    const { service, findFirst, trainingAggregate, query, timezone, snapshot } = setup();
    const chart = await service.readCoachMetricChart('athlete', 'session', 'message', 'chart-1');
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'athlete', sessionId: 'session', id: 'message', role: 'ASSISTANT' },
    }));
    expect(trainingAggregate).toHaveBeenCalledWith(
      expect.objectContaining({ session: { user: { id: 'athlete' } } }),
      expect.objectContaining(query), timezone,
    );
    expect(chart).toMatchObject({
      rows: [{ values: { AVG_HEART_RATE: 142.5 } }, { values: { AVG_HEART_RATE: null } }],
      provenance: { fingerprint: snapshot.provenance.fingerprint, coverageDetails: {
        AVG_HEART_RATE: { known: 40, total: 60, unit: 'min' },
      } },
    });
  });

  it('rejects another athlete, an unknown delivery, and revoked consent', async () => {
    const { service, findFirst, isGranted, trainingAggregate } = setup();
    for (const [user, delivery] of [['another', 'chart-1'], ['athlete', 'chart-2']]) {
      await expect(service.readCoachMetricChart(user, 'session', 'message', delivery))
        .rejects.toMatchObject({ status: 404 });
    }
    isGranted.mockResolvedValue(false);
    findFirst.mockClear();
    await expect(service.readCoachMetricChart('athlete', 'session', 'message', 'chart-1'))
      .rejects.toMatchObject({ status: 404 });
    expect(findFirst).not.toHaveBeenCalled();
    expect(trainingAggregate).not.toHaveBeenCalled();
  });

  it('limits regrouping and metric source switching to the original query scope', async () => {
    const activities = setup();
    const table = await activities.service.readCoachMetricChart('athlete', 'session', 'message', 'chart-1', { byActivity: 'true' });
    expect(table).toMatchObject({
      view: 'TABLE',
      provenance: { from: activities.query.from, to: activities.query.to, groupBy: 'ACTIVITY' },
      rows: [expect.objectContaining({ activityHashId: 'measured' }), expect.objectContaining({ activityHashId: 'without-signal' })],
    });
    const vo2 = setup({ source: 'METRICS', measures: ['VO2_MAX'], metricSource: 'MANUAL' });
    const original = await vo2.service.readCoachMetricChart('athlete', 'session', 'message', 'chart-1');
    expect(original).toMatchObject({
      metricSources: ['ESTIMATED', 'MANUAL'], summary: { VO2_MAX: 52 },
    });
    const estimated = await vo2.service.readCoachMetricChart('athlete', 'session', 'message', 'chart-1', { metricSource: 'ESTIMATED' });
    expect(estimated).toMatchObject({
      provenance: { metricSource: 'ESTIMATED', from: vo2.query.from, to: vo2.query.to },
      summary: { VO2_MAX: 46 },
    });
  });
});
