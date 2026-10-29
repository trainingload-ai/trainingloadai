import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, jest } from '@jest/globals';
import { PrismaService } from '@/prisma/prisma.service';
import { SelfHostTelemetryConsentService } from './self-host-telemetry-consent.service';

describe('SelfHostTelemetryConsentService', () => {
  async function setup(initial: Record<string, unknown> | null) {
    let row = initial;
    const findUnique = jest.fn(async () => row);
    const update = jest.fn(
      async ({ data }: { data: Record<string, unknown> }) => {
        row = { ...(row ?? {}), ...data };
        return row;
      },
    );
    const module = await Test.createTestingModule({
      providers: [
        SelfHostTelemetryConsentService,
        {
          provide: PrismaService,
          useValue: {
            selfHostInstance: { findUnique, update },
          },
        },
      ],
    }).compile();
    return {
      service: module.get(SelfHostTelemetryConsentService),
      update,
    };
  }

  it('fails closed when the owner has not made a current-version choice', async () => {
    const { service } = await setup({
      telemetryConsentGranted: true,
      telemetryConsentVersion: 'obsolete-version',
      telemetryConsentSource: 'ONBOARDING',
      telemetryConsentUpdatedAt: new Date('2026-10-24T10:00:00.000Z'),
    });

    await expect(service.getConsent()).resolves.toMatchObject({
      granted: null,
      version: 'operation-analytics-v1',
    });
  });

  it('persists an explicit owner choice and its source', async () => {
    const { service, update } = await setup({
      telemetryConsentGranted: null,
      telemetryConsentVersion: null,
      telemetryConsentSource: null,
      telemetryConsentUpdatedAt: null,
    });

    await expect(
      service.updateConsent({ granted: true, source: 'ONBOARDING' }),
    ).resolves.toMatchObject({
      granted: true,
      version: 'operation-analytics-v1',
      source: 'ONBOARDING',
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          telemetryConsentGranted: true,
          telemetryConsentVersion: 'operation-analytics-v1',
          telemetryConsentSource: 'ONBOARDING',
        }),
      }),
    );
  });

  it('rejects a missing self-host singleton', async () => {
    const { service } = await setup(null);

    await expect(service.getConsent()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
