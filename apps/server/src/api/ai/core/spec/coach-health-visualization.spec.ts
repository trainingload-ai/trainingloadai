import { describe, expect, it, jest } from '@jest/globals';
import type { DailyHealthData } from '@shared/health-overview';
import { readCoachHealthVisualization } from '../coach-health-visualization';
import { buildCoachUiCardToolUseBlocks } from '../tool-loop-agent.runtime';
import {
  buildStoredCoachUiMessageEnvelope,
  hasStoredCoachMetricCard,
  sanitizeStoredCoachMessageForClient,
} from '../coach-history-messages';

const observedAt = '2026-11-22T04:00:00.000Z';
const source = (date: string, type: string, value: number, provider: string): DailyHealthData => ({
  date, timezone: 'Asia/Shanghai', metrics: [{ type, value, provider, unit: 'ms' }],
});
const days = [
  source('2026-11-19', 'HRV_RMSSD_MS', 52, 'GARMIN'),
  source('2026-11-20', 'HRV_SDNN_MS', 35, 'APPLE_HEALTH'),
  source('2026-11-21', 'HRV_SDNN_MS', 39, 'APPLE_HEALTH'),
  { date: '2026-11-22', timezone: 'Asia/Shanghai', metrics: [] },
];

describe('coach health card and chart', () => {
  it('keeps the requested day empty and separately references the recent observation', async () => {
    const getOverview = jest.fn(async () => ({ startDate: '2026-11-16', endDate: '2026-11-22', days }));
    const result = await readCoachHealthVisualization({ getOverview }, 'athlete', {
      metric: 'hrv', from: '2026-11-22', to: '2026-11-22', mode: 'LATEST',
    }, { observedAt, recent: true });
    expect(result).toMatchObject({
      value: null, knownDays: 0,
      scope: { from: '2026-11-22', to: '2026-11-22' },
      recent: { date: '2026-11-21', value: 39, scope: { hrvType: 'HRV_SDNN_MS', provider: 'APPLE_HEALTH' } },
    });
    expect(result.chart).toBeUndefined();
    expect(getOverview).toHaveBeenCalledWith('athlete', 7, '2026-11-22');
    const content = buildCoachUiCardToolUseBlocks({
      tools: [],
      calls: [{ id: 'health-1', name: 'present_coach_health', input: { metric: 'hrv' } }],
      results: [{ id: 'health-1', name: 'present_coach_health', input: {}, output: result, ok: true }],
    });
    const stored = buildStoredCoachUiMessageEnvelope({
      role: 'assistant', content: '', message: { content },
    });
    expect(stored.parts).toContainEqual(expect.objectContaining({
      type: 'data-coach-tool',
      data: { toolCallId: 'health-1', name: 'CoachHealthVisualization', input: result },
    }));
    expect(hasStoredCoachMetricCard(stored)).toBe(true);
    expect(JSON.stringify(sanitizeStoredCoachMessageForClient(stored, 'en', false))).not.toContain('CoachHealthVisualization');
  });

  it('locks method and provider across the summary and detailed chart', async () => {
    const getOverview = async () => ({ startDate: '2026-11-16', endDate: '2026-11-22', days });
    const result = await readCoachHealthVisualization({ getOverview }, 'athlete', {
      metric: 'hrv', from: '2026-11-19', to: '2026-11-22', mode: 'TREND',
    }, { observedAt });
    expect(result).toMatchObject({ value: 37, knownDays: 2, date: '2026-11-21' });
    const chart = await readCoachHealthVisualization({ getOverview }, 'athlete', result.scope, { observedAt, chart: true });
    expect(chart.fingerprint).toBe(result.fingerprint);
    expect(chart.chart?.points.map((point) => point.value)).toEqual([undefined, 35, 39, undefined]);
    const garmin = chart.hrvSources?.find((source) => source.provider === 'GARMIN');
    expect(garmin).toBeDefined();
    const switched = await readCoachHealthVisualization({ getOverview }, 'athlete', result.scope, {
      observedAt, chart: true, hrvSourceId: garmin!.id,
    });
    expect(switched.scope).toMatchObject({ ...result.scope, provider: 'GARMIN', hrvType: 'HRV_RMSSD_MS' });
    expect(switched).toMatchObject({ value: 52, knownDays: 1 });
    expect(switched.chart?.points.map((point) => point.value)).toEqual([52, undefined, undefined, undefined]);
    const unavailable = await readCoachHealthVisualization({ getOverview }, 'athlete', result.scope, {
      observedAt, chart: true, hrvSourceId: 'unavailable',
    });
    expect(unavailable).toMatchObject({ value: null, knownDays: 0 });
    const baseline = await readCoachHealthVisualization({ getOverview }, 'athlete', {
      ...result.scope, from: '2026-11-21', to: '2026-11-21', mode: 'BASELINE',
    }, { observedAt });
    expect(baseline.baseline).toBeNull();
  });

  it('keeps time in bed and sleep duration in distinct series', async () => {
    const getOverview = async () => ({
      startDate: '2026-11-16', endDate: '2026-11-22',
      days: [
        source('2026-11-21', 'SLEEP_IN_BED_SECONDS', 27_000, 'GARMIN'),
        source('2026-11-22', 'SLEEP_ASLEEP_SECONDS', 23_400, 'GARMIN'),
      ],
    });
    const result = await readCoachHealthVisualization({ getOverview }, 'athlete', {
      metric: 'sleep', from: '2026-11-21', to: '2026-11-22', mode: 'AVERAGE',
    }, { observedAt, chart: true });
    expect(result).toMatchObject({
      value: 23_400, knownDays: 1, scope: { sleepValueKind: 'timeAsleep' },
    });
    expect(result.chart?.points.map(({ value }) => value)).toEqual([undefined, 23_400]);
  });
});
