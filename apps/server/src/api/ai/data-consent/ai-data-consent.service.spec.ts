import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  AiDataConsentService,
  AI_DATA_CONSENT_VERSION,
} from '@/ai-data-consent/ai-data-consent.service';
import { getCoachUpstreamProvider } from '../core/coach-upstream.adapter';

jest.mock('../core/coach-upstream.adapter', () => ({
  getCoachUpstreamProvider: jest.fn(() => 'deepseek'),
}));

const mockGetCoachUpstreamProvider = jest.mocked(getCoachUpstreamProvider);

function createService(value: string | null = null) {
  const findUnique = jest.fn(async () => (value === null ? null : { value }));
  const upsert = jest.fn(async (_args: unknown) => ({}));
  const prisma = {
    userSetting: { findUnique, upsert },
  };
  const users = { settings: () => prisma.userSetting };

  return {
    service: new AiDataConsentService(users as never),
    findUnique,
    upsert,
  };
}

describe('AiDataConsentService', () => {
  beforeEach(() => {
    mockGetCoachUpstreamProvider.mockReturnValue('deepseek');
  });

  it('fails closed when there is no current, provider-bound consent', async () => {
    const { service } = createService();

    await expect(service.getStatus('user-1')).resolves.toEqual({
      state: 'UNDECIDED',
      granted: false,
      promptRequired: true,
      required: true,
      version: AI_DATA_CONSENT_VERSION,
      provider: 'deepseek',
      recipient:
        'DeepSeek (Hangzhou DeepSeek Artificial Intelligence Co., Ltd.)',
      decidedAt: null,
    });
    await expect(service.assertGranted('user-1')).rejects.toMatchObject({
      message: 'AI_DATA_CONSENT_REQUIRED',
    });
  });

  it('accepts only consent for the current version and provider', async () => {
    const current = JSON.stringify({
      version: AI_DATA_CONSENT_VERSION,
      provider: 'deepseek',
      recipient: 'DeepSeek',
      granted: true,
      decidedAt: '2026-09-03T00:00:00.000Z',
      source: 'COACH',
    });
    const { service } = createService(current);

    await expect(service.isGranted('user-1')).resolves.toBe(true);
  });

  it('stores an explicit denial and returns a disabled status', async () => {
    const { service, findUnique, upsert } = createService();
    upsert.mockImplementationOnce(async ({ create }: any) => {
      findUnique.mockResolvedValue({ value: create.value });
      return {};
    });

    await expect(
      service.recordDecision({
        userId: 'user-1',
        granted: false,
        source: 'ACCOUNT_SETTINGS',
        locale: 'zh',
      }),
    ).resolves.toMatchObject({
      state: 'DECLINED',
      granted: false,
      promptRequired: false,
      required: false,
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: 'user-1',
          value: expect.stringContaining('"granted":false'),
        }),
      }),
    );
  });

  it('requires renewed consent when a previous grant targets an old version', async () => {
    const stale = JSON.stringify({
      version: '2026-01-01',
      provider: 'deepseek',
      recipient: 'DeepSeek',
      granted: true,
      decidedAt: '2026-01-01T00:00:00.000Z',
      source: 'COACH',
    });
    const { service } = createService(stale);

    await expect(service.getStatus('user-1')).resolves.toMatchObject({
      state: 'RECONSENT_REQUIRED',
      granted: false,
      promptRequired: true,
      required: true,
    });
  });

  it('requires renewed consent when the provider changes', async () => {
    const staleProviderGrant = JSON.stringify({
      version: AI_DATA_CONSENT_VERSION,
      provider: 'openrouter',
      recipient: 'OpenRouter',
      granted: true,
      decidedAt: '2026-09-03T00:00:00.000Z',
      source: 'COACH',
    });
    const { service } = createService(staleProviderGrant);

    await expect(service.getStatus('user-1')).resolves.toMatchObject({
      state: 'RECONSENT_REQUIRED',
      granted: false,
      promptRequired: true,
    });
  });

  it('does not re-prompt a user who explicitly declined an older version', async () => {
    const staleDenial = JSON.stringify({
      version: '2026-01-01',
      provider: 'openrouter',
      recipient: 'OpenRouter',
      granted: false,
      decidedAt: '2026-01-01T00:00:00.000Z',
      source: 'ACCOUNT_SETTINGS',
    });
    const { service } = createService(staleDenial);

    await expect(service.getStatus('user-1')).resolves.toMatchObject({
      state: 'DECLINED',
      granted: false,
      promptRequired: false,
      required: false,
    });
  });

  it('is unavailable and refuses a grant when no approved provider exists', async () => {
    mockGetCoachUpstreamProvider.mockReturnValue(null);
    const { service, upsert } = createService();

    await expect(service.getStatus('user-1')).resolves.toMatchObject({
      state: 'UNAVAILABLE',
      granted: false,
      promptRequired: false,
      required: false,
      provider: null,
    });
    await expect(
      service.recordDecision({
        userId: 'user-1',
        granted: true,
        source: 'ONBOARDING',
      }),
    ).rejects.toMatchObject({ message: 'AI_PROVIDER_UNAVAILABLE' });
    expect(upsert).not.toHaveBeenCalled();
  });
});
