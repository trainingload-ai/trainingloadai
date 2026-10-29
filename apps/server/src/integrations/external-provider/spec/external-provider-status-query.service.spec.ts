import { Test } from '@nestjs/testing';
import { describe, expect, it, jest } from '@jest/globals';
import { ExternalProviderConnectionService } from '../external-provider-connection.service';
import { ExternalProviderStatusQueryService } from '../external-provider-status-query.service';

describe('ExternalProviderStatusQueryService Core', () => {
  it('returns provider-neutral connection state and settings', async () => {
    const connections = {
      model: jest.fn(() => ({
        findMany: jest.fn(async () => [
          {
            provider: 'intervals_icu',
            status: 'ACTIVE',
            syncScheduledActivities: false,
            exportActivities: true,
            metadata: {
              integration: {
                settings: {
                  importActivitiesAutomatically: false,
                  exportActivitiesAutomatically: true,
                  importPlannedWorkouts: true,
                  exportPlannedWorkouts: true,
                },
              },
            },
          },
        ]),
      })),
    };
    const module = await Test.createTestingModule({
      providers: [
        ExternalProviderStatusQueryService,
        { provide: ExternalProviderConnectionService, useValue: connections },
      ],
    }).compile();

    const [status] = await module
      .get(ExternalProviderStatusQueryService)
      .listForUser('user-1', 'intervals_icu');

    expect(status).toMatchObject({
      provider: 'intervals_icu',
      enabled: true,
      connected: true,
      operations: {
        completedActivities: {
          import: { state: 'AUTOMATIC_DISABLED' },
          export: { state: 'AUTOMATIC_ENABLED' },
        },
      },
    });
  });
});
