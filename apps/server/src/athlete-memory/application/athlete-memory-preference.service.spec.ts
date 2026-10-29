import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { AthleteMemoryPreferenceService } from './athlete-memory-preference.service';

const originalSelfHostMode = process.env.SELF_HOST_MODE;

describe('AthleteMemoryPreferenceService', () => {
  const findUnique = jest.fn<(...args: any[]) => Promise<any>>();
  const upsert = jest.fn<(...args: any[]) => Promise<any>>();
  const settings = { findUnique, upsert };
  const users = { settings: jest.fn(() => settings) };
  const consent = {
    getStatus: jest.fn(async () => ({ granted: true })),
    isGranted: jest.fn(async () => true),
  };
  const service = new AthleteMemoryPreferenceService(
    users as never,
    consent as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SELF_HOST_MODE;
    findUnique.mockResolvedValue(null);
    upsert.mockResolvedValue({});
    consent.getStatus.mockResolvedValue({ granted: true });
    consent.isGranted.mockResolvedValue(true);
  });

  afterEach(() => {
    if (originalSelfHostMode === undefined) delete process.env.SELF_HOST_MODE;
    else process.env.SELF_HOST_MODE = originalSelfHostMode;
  });

  it('defaults the independent memory preference to enabled', async () => {
    await expect(service.get('athlete')).resolves.toEqual({
      available: true,
      enabled: true,
      effectiveEnabled: true,
      updatedAt: null,
      consentRequired: false,
    });
    await expect(service.isEnabled('athlete')).resolves.toBe(true);
  });

  it('preserves an explicit managed opt-out', async () => {
    findUnique.mockResolvedValue({
      value: JSON.stringify({
        enabled: false,
        updatedAt: '2026-10-24T00:00:00Z',
      }),
    });

    await expect(service.get('athlete')).resolves.toMatchObject({
      enabled: false,
      effectiveEnabled: false,
      consentRequired: false,
      updatedAt: '2026-10-24T00:00:00Z',
    });
  });

  it('is enabled by default in self-host without requiring an AI provider', async () => {
    process.env.SELF_HOST_MODE = 'core-local';
    consent.getStatus.mockResolvedValue({ granted: false });

    await expect(service.get('athlete')).resolves.toEqual({
      available: true,
      enabled: true,
      effectiveEnabled: true,
      updatedAt: null,
      consentRequired: false,
    });
    await expect(service.isEnabled('athlete')).resolves.toBe(true);
  });

  it('allows the self-host owner to re-enable memory before AI is configured', async () => {
    process.env.SELF_HOST_MODE = 'core-local';
    consent.isGranted.mockResolvedValue(false);

    await expect(service.set('athlete', true)).resolves.toMatchObject({
      enabled: true,
      consentRequired: false,
    });
    expect(consent.isGranted).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalled();
  });

  it('preserves an explicit self-host opt-out', async () => {
    process.env.SELF_HOST_MODE = 'core-local';
    findUnique.mockResolvedValue({
      value: JSON.stringify({
        enabled: false,
        updatedAt: '2026-10-23T00:00:00Z',
      }),
    });

    await expect(service.get('athlete')).resolves.toMatchObject({
      enabled: false,
      effectiveEnabled: false,
      consentRequired: false,
      updatedAt: '2026-10-23T00:00:00Z',
    });
  });

  it('allows the preference to stay enabled without current AI consent', async () => {
    consent.isGranted.mockResolvedValue(false);
    consent.getStatus.mockResolvedValue({ granted: false });

    await expect(service.set('athlete', true)).resolves.toMatchObject({
      enabled: true,
      effectiveEnabled: false,
      consentRequired: true,
    });
    expect(upsert).toHaveBeenCalled();
  });

  it('keeps the preference enabled but pauses its effect when consent is invalid', async () => {
    findUnique.mockResolvedValue({
      value: JSON.stringify({
        enabled: true,
        updatedAt: '2026-10-11T00:00:00Z',
      }),
    });
    consent.getStatus.mockResolvedValue({ granted: false });

    await expect(service.get('athlete')).resolves.toMatchObject({
      available: true,
      enabled: true,
      effectiveEnabled: false,
      consentRequired: true,
    });
  });
});
