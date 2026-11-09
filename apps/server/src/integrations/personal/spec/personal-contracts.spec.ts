import { describe, expect, it } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { healthDay, dateRange, localToday } from '../personal-dates';
import { publicDownloadAddress } from '../personal-download';
import {
  corosRecordPageLimit,
  corosStructuredResult,
} from '../../coros-mcp/coros-mcp.client';
import { personalSyncCounts } from '../personal-sync-summary';
import {
  garminResourceRequest,
  GARMIN_RESOURCES,
} from '../../garmin-personal/garmin-personal-resources';
import { ExternalProviderCredentialVault } from '../../external-provider/external-provider-credential-vault.service';
import { IntervalsIcuCredentialService } from '../../intervals-icu/intervals-icu-credential.service';
import { garminHealthCandidates } from '../personal-health.mapper';
import {
  parsePersonalSettings,
  defaultPersonalSettings,
} from '../personal-connection.service';

describe('personal provider contracts', () => {
  it('uses the documented record window and respects a tighter live schema', () => {
    const tool = (limit: object) => [
      { name: 'querySportRecords', inputSchema: { properties: { limit } } },
    ];
    expect(corosRecordPageLimit(tool({ type: 'integer', maximum: 100 }))).toBe(
      20,
    );
    expect(corosRecordPageLimit(tool({ type: 'integer', maximum: 10 }))).toBe(
      10,
    );
    expect(() => corosRecordPageLimit([])).toThrow('PROVIDER_SCHEMA_CHANGED');
    expect(() =>
      corosRecordPageLimit(tool({ type: 'integer', minimum: 21 })),
    ).toThrow('PROVIDER_SCHEMA_CHANGED');
  });
  it('reports committed imports independently from an interrupted parent discovery', () => {
    expect(
      personalSyncCounts([
        { kind: 'ACTIVITY', status: 'SUCCEEDED' },
        { kind: 'ACTIVITY', status: 'WAITING' },
        {
          kind: 'ACTIVITY',
          status: 'WAITING',
          result: { fileKey: 'fit/a.fit', batchId: 'batch-1', imported: 0 },
        },
        { kind: 'ACTIVITY', status: 'FAILED' },
        { kind: 'HEALTH', status: 'SUCCEEDED' },
      ]),
    ).toEqual({
      discovered: 4,
      downloading: 1,
      importing: 1,
      imported: 1,
      healthDays: 1,
      failed: 1,
      pending: 2,
    });
  });
  it('keeps a local health label separate from UTC bounds and DST duration', () => {
    const shanghai = healthDay('2026-11-01', 'Asia/Shanghai');
    expect(shanghai.localDate.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(shanghai.startTime.toISOString()).toBe('2026-10-31T16:00:00.000Z');
    const spring = healthDay('2026-03-08', 'America/Los_Angeles');
    const autumn = healthDay('2026-11-01', 'America/Los_Angeles');
    expect(
      (spring.endTime.valueOf() - spring.startTime.valueOf()) / 3600000,
    ).toBe(23);
    expect(
      (autumn.endTime.valueOf() - autumn.startTime.valueOf()) / 3600000,
    ).toBe(25);
    expect(localToday('Asia/Shanghai', new Date('2026-10-31T16:05:00Z'))).toBe(
      '2026-11-01',
    );
    expect(() => dateRange('2026-02-30', '2026-03-01')).toThrow();
  });
  it.each([
    '127.0.0.1',
    '10.1.1.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::ffff:127.0.0.1',
    '224.0.0.1',
  ])('rejects nonpublic download address %s', (address) => {
    expect(publicDownloadAddress(address)).toBe(false);
  });
  it('admits structured MCP results but never natural language as facts', () => {
    expect(corosStructuredResult({ structuredContent: { id: '1' } })).toEqual({
      id: '1',
    });
    expect(
      corosStructuredResult({
        content: [{ type: 'text', text: '{"id":"1"}' }],
      }),
    ).toEqual({ id: '1' });
    expect(() =>
      corosStructuredResult({
        content: [{ type: 'text', text: 'You slept 8 hours.' }],
      }),
    ).toThrow('PROVIDER_STRUCTURED_RESULT_UNAVAILABLE');
    expect(() =>
      corosStructuredResult({ isError: true, structuredContent: {} }),
    ).toThrow('PROVIDER_TOOL_FAILED');
  });
  it('covers the complete documented Garmin GET catalog without arbitrary URLs', () => {
    expect(Object.keys(GARMIN_RESOURCES)).toHaveLength(26);
    expect(
      garminResourceRequest('sleep', { date: '2026-10-31' }, 'UTC'),
    ).toMatchObject({
      path: '/sleep-service/sleep/dailySleep',
      query: { date: '2026-10-31' },
    });
    expect(() =>
      garminResourceRequest(
        'stress',
        { startDate: '2026-10-01', endDate: '2026-10-29' },
        'UTC',
      ),
    ).toThrow('PROVIDER_DATE_RANGE_INVALID');
    expect(() => garminResourceRequest('nutrition', {}, 'UTC')).toThrow(
      'PROVIDER_SENSITIVE_CONFIRMATION_REQUIRED',
    );
    expect(() => garminResourceRequest('https://evil.test', {}, 'UTC')).toThrow(
      'PROVIDER_RESOURCE_UNKNOWN',
    );
    expect(() =>
      garminResourceRequest('activity', { activityId: '../../x' }, 'UTC'),
    ).toThrow('PROVIDER_ACTIVITY_ID_INVALID');
  });
  it('preserves the old authenticated encryption envelope across extraction', () => {
    const config = new ConfigService({
      externalProviderCredentialSecret: 'a'.repeat(32),
    });
    const intervals = new IntervalsIcuCredentialService(config);
    const vault = new ExternalProviderCredentialVault(config);
    const sealed = intervals.encrypt('fixture-only-key');
    expect(vault.decrypt(sealed)).toBe('fixture-only-key');
    expect(intervals.decrypt(vault.encrypt('fixture-only-key'))).toBe(
      'fixture-only-key',
    );
    const parts = sealed.split(':');
    parts[2] = Buffer.alloc(16).toString('base64url');
    expect(() => vault.decrypt(parts.join(':'))).toThrow();
  });
  it('uses the Personal API DTOs and documented kg without replacing local readiness', () => {
    const rows = garminHealthCandidates({
      day: '2026-10-31',
      timezone: 'Asia/Shanghai',
      accountId: '1',
      connectionId: 'c',
      summary: {
        data: [
          {
            calendarDate: '2026-10-31',
            movement: { steps: { value: 1200 } },
            heartRate: { restingValue: 52 },
          },
        ],
      },
      sleep: { calendarDate: '2026-10-31', sleepTimeSeconds: 26000 },
      weight: {
        dailyWeightSummaries: [
          {
            summaryDate: '2026-10-31',
            latestWeight: { calendarDate: '2026-10-31', weight: 72 },
          },
        ],
      },
    });
    expect(rows.map((row) => [row.metricType, row.value])).toEqual(
      expect.arrayContaining([
        ['STEP_COUNT', 1200],
        ['RESTING_HEART_RATE_BPM', 52],
        ['BODY_MASS_KG', 72],
      ]),
    );
    expect(rows.some((row) => row.metricType.includes('BODY_BATTERY'))).toBe(
      false,
    );
    expect(
      rows.every(
        (row) =>
          row.provider === 'GARMIN' &&
          row.startTime.toISOString() === '2026-10-30T16:00:00.000Z',
      ),
    ).toBe(true);
  });
  it('rejects unsupported directions instead of silently enabling Garmin writes', () => {
    expect(() =>
      parsePersonalSettings(
        { ...defaultPersonalSettings, allowWrites: true },
        'garmin',
        'UTC',
      ),
    ).toThrow('PROVIDER_DIRECTION_UNSUPPORTED');
    expect(() =>
      parsePersonalSettings(defaultPersonalSettings, 'coros', 'Moon/Base'),
    ).toThrow('PROVIDER_TIMEZONE_INVALID');
  });
});
