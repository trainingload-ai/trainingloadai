import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExternalProviderConnectionService } from '@/integrations/external-provider/external-provider-connection.service';
import type { PrismaTx } from '@/prisma/prisma-db';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PrismaService } from '@/prisma/prisma.service';
import { HealthFileQueryService } from '@/health-data/health-file-query.service';
import { ImportingJobService } from '@/importing/importing-job.service';
import { UserQueryService } from './user-query.service';
import { CalendarCleanupService } from '@/api/calendar/calendar-cleanup.service';
import {
  ACCOUNT_DELETION_REQUESTED_EVENT,
  AccountDeletionRequestedEvent,
} from './events/account-deletion.events';
import {
  accountDeletionSubjectHash,
  encryptAccountDeletionValue,
} from './account-deletion-crypto';
import {
  ACCOUNT_DELETION_OBLIGATIONS,
  type AccountDeletionObligations,
} from '@/account-lifecycle/account-deletion-obligations.port';
import { resolveSelfHostAccessMode } from '@/self-host/self-host-local-access-policy';
import {
  ACCOUNT_DELETION_LOCAL_DATA,
  type AccountDeletionLocalData,
} from '@/account-lifecycle/account-deletion-local-data.port';

export type AccountDeletionConfirmation = {
  confirmPermanentDeletion: boolean;
  acknowledgeAsyncDeletion: boolean;
  acknowledgeExternalObligations: boolean;
};

export type AccountDeletionStorageManifest = {
  private: string[];
  public: string[];
};

type AccountDeletionProviderManifest = {
  authProviders: Array<{ providerId: string; accountId: string }>;
  externalProviders: Array<{
    provider: string;
    externalAthleteId: string | null;
  }>;
};

function cleanKey(value: string | null | undefined) {
  const key = String(value ?? '').trim();
  return key || null;
}

@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ACCOUNT_DELETION_OBLIGATIONS)
    private readonly obligations: AccountDeletionObligations,
    private readonly calendar: CalendarCleanupService,
    private readonly events: EventEmitter2,
    private readonly healthFiles: HealthFileQueryService,
    private readonly importJobs: ImportingJobService,
    private readonly providerConnections: ExternalProviderConnectionService,
    private readonly users: UserQueryService,
    @Inject(ACCOUNT_DELETION_LOCAL_DATA)
    private readonly deploymentLocalData: AccountDeletionLocalData,
  ) {}

  async preview(userId: string) {
    const [obligations, job] = await Promise.all([
      this.obligations.preview(userId),
      this.prisma.accountDeletionJob.findFirst({
        where: { userId },
        select: { id: true, status: true, requestedAt: true },
      }),
    ]);
    return {
      ...obligations,
      deletion: {
        asynchronous: true,
        expectedCompletionHours: 24,
        maximumCompletionDays: 7,
        existingRequest: job
          ? {
              requestId: job.id,
              status: job.status,
              requestedAt: job.requestedAt.toISOString(),
            }
          : null,
      },
    };
  }

  async prepareDeletion(userId: string) {
    return await this.obligations.prepareDeletion(userId);
  }

  async requestDeletion(args: {
    userId: string;
    idempotencyKey: string;
    confirmation: AccountDeletionConfirmation;
  }) {
    this.assertConfirmation(args.confirmation);
    await this.assertSelfHostOwnerCanBeDeleted(args.userId);
    const idempotencyKey = args.idempotencyKey.trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      throw new BadRequestException({
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'INVALID_IDEMPOTENCY_KEY',
      });
    }
    await this.obligations.assertDeletionAllowed(args.userId);
    const subjectHash = accountDeletionSubjectHash(args.userId);
    const extensionSnapshot = await this.obligations.snapshot(
      args.userId,
    );

    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "t_user"
          WHERE "id" = ${args.userId}
          FOR UPDATE
        `;

        const existing = await tx.accountDeletionJob.findFirst({
          where: { userId: args.userId },
          select: {
            id: true,
            status: true,
            requestedAt: true,
          },
        });
        if (existing) return existing;
        const reusedKey = await tx.accountDeletionJob.findUnique({
          where: { idempotencyKey },
          select: {
            id: true,
            subjectHash: true,
            status: true,
            requestedAt: true,
          },
        });
        if (reusedKey && reusedKey.subjectHash !== subjectHash) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_ALREADY_USED',
            message: 'IDEMPOTENCY_KEY_ALREADY_USED',
          });
        }
        if (reusedKey) return reusedKey;

        const user = await this.users.users(tx).findUnique({
          where: { id: args.userId },
          select: {
            id: true,
            email: true,
            preferredLocale: true,
            accountDeletionRequestedAt: true,
          },
        });
        if (!user) {
          throw new NotFoundException({
            code: 'ACCOUNT_NOT_FOUND',
            message: 'ACCOUNT_NOT_FOUND',
          });
        }
        if (user.accountDeletionRequestedAt) {
          throw new ConflictException({
            code: 'ACCOUNT_DELETION_IN_PROGRESS',
            message: 'ACCOUNT_DELETION_IN_PROGRESS',
          });
        }

        const [storageManifest, providerManifest] = await Promise.all([
          this.collectStorageManifest(tx, args.userId),
          this.collectProviderManifest(tx, args.userId),
        ]);

        const requestedAt = new Date();
        const job = await tx.accountDeletionJob.create({
          data: {
            userId: args.userId,
            subjectHash,
            idempotencyKey,
            status: 'QUEUED',
            resumeStage: 'REVOKING_PROVIDERS',
            storageManifest,
            providerManifest,
            extensionSnapshot,
            notificationEmailCiphertext: encryptAccountDeletionValue(
              user.email,
            ),
            notificationLocale: user.preferredLocale ?? 'en',
            requestedAt,
          },
          select: {
            id: true,
            status: true,
            requestedAt: true,
          },
        });

        await this.users.users(tx).update({
          where: { id: args.userId },
          data: { accountDeletionRequestedAt: requestedAt },
        });
        await this.deploymentLocalData.revokeLocalCredentials({
          tx,
          userId: args.userId,
          requestedAt,
        });
        await tx.t_user_sessions.deleteMany({
          where: { userId: args.userId },
        });
        await tx.oauthAccessToken.deleteMany({
          where: { userId: args.userId },
        });
        await tx.oauthRefreshToken.deleteMany({
          where: { userId: args.userId },
        });
        await tx.oauthConsent.deleteMany({
          where: { userId: args.userId },
        });
        await tx.t_user_verifications.deleteMany({
          where: {
            OR: [
              { identifier: user.email },
              { identifier: { endsWith: `-${user.email}` } },
            ],
          },
        });
        await this.calendar.deleteAllForUser(args.userId, tx);

        return job;
      },
      { isolationLevel: 'Serializable' },
    );

    if (this.events) {
      await this.events.emitAsync(
        ACCOUNT_DELETION_REQUESTED_EVENT,
        new AccountDeletionRequestedEvent(args.userId),
      );
    }

    return {
      accepted: true,
      requestId: result.id,
      status: result.status,
      requestedAt: result.requestedAt.toISOString(),
      expectedCompletionHours: 24,
      maximumCompletionDays: 7,
    };
  }

  private async assertSelfHostOwnerCanBeDeleted(userId: string) {
    const instance = await this.prisma.selfHostInstance.findUnique({
      where: { id: 1 },
      select: { state: true, ownerUserId: true },
    });
    if (
      instance?.state === 'READY' &&
      instance.ownerUserId === userId &&
      resolveSelfHostAccessMode() !== 'local-owner'
    ) {
      throw new ConflictException({
        code: 'SELF_HOST_OWNER_DELETION_REQUIRES_TRANSFER',
        message: 'SELF_HOST_OWNER_DELETION_REQUIRES_TRANSFER',
      });
    }
  }

  async deleteAccount(userId: string, idempotencyKey: string) {
    return await this.requestDeletion({
      userId,
      idempotencyKey,
      confirmation: {
        confirmPermanentDeletion: true,
        acknowledgeAsyncDeletion: true,
        acknowledgeExternalObligations: true,
      },
    });
  }

  private assertConfirmation(confirmation: AccountDeletionConfirmation) {
    if (
      confirmation.confirmPermanentDeletion !== true ||
      confirmation.acknowledgeAsyncDeletion !== true ||
      confirmation.acknowledgeExternalObligations !== true
    ) {
      throw new BadRequestException({
        code: 'ACCOUNT_DELETION_CONFIRMATIONS_REQUIRED',
        message: 'ACCOUNT_DELETION_CONFIRMATIONS_REQUIRED',
      });
    }
  }

  async collectStorageManifest(
    tx: PrismaTx,
    userId: string,
  ): Promise<AccountDeletionStorageManifest> {
    const [
      user,
      activities,
      sourceObjects,
      activitySources,
      importDrafts,
      healthSeriesFiles,
      userDataExports,
    ] = await Promise.all([
      this.users.users(tx).findUnique({
        where: { id: userId },
        select: { image: true },
      }),
      tx.activity.findMany({
        where: { userId },
        select: {
          fileKey: true,
          parquetFiles: { select: { parquetPath: true } },
          mapThumbJob: {
            select: { r2Key: true, r2DarkKey: true },
          },
        },
      }),
      this.importJobs.sourceObjects(tx).findMany({
        where: { userId },
        select: { fileKey: true, rawStorageKey: true },
      }),
      tx.activitySource.findMany({
        where: { userId },
        select: { fileKey: true },
      }),
      tx.activityImportDraft.findMany({
        where: { userId },
        select: { fileKey: true, rawStorageKey: true },
      }),
      this.healthFiles.listParquetPathsForUser(userId),
      tx.userDataExportJob.findMany({
        where: { userId },
        select: { artifactStorageKey: true },
      }),
    ]);

    const privateKeys = new Set<string>();
    const publicKeys = new Set<string>();
    const addPrivate = (value: string | null | undefined) => {
      const key = cleanKey(value);
      if (key) privateKeys.add(key);
    };
    const addPublic = (value: string | null | undefined) => {
      const key = cleanKey(value);
      if (key) publicKeys.add(key);
    };

    for (const activity of activities) {
      addPrivate(activity.fileKey);
      for (const parquet of activity.parquetFiles) {
        addPrivate(parquet.parquetPath);
      }
      addPublic(activity.mapThumbJob?.r2Key);
      addPublic(activity.mapThumbJob?.r2DarkKey);
    }
    for (const row of sourceObjects) {
      addPrivate(row.fileKey);
      addPrivate(row.rawStorageKey);
    }
    for (const row of activitySources) addPrivate(row.fileKey);
    for (const row of importDrafts) {
      addPrivate(row.fileKey);
      addPrivate(row.rawStorageKey);
    }
    for (const row of healthSeriesFiles) addPrivate(row.parquetPath);
    for (const row of userDataExports) addPrivate(row.artifactStorageKey);

    const avatarKey = this.internalAvatarStorageKey(user?.image);
    if (avatarKey) addPublic(avatarKey);

    return {
      private: [...privateKeys].sort(),
      public: [...publicKeys].sort(),
    };
  }

  private async collectProviderManifest(
    tx: PrismaTx,
    userId: string,
  ): Promise<AccountDeletionProviderManifest> {
    const [accounts, connections] = await Promise.all([
      tx.t_user_accounts.findMany({
        where: { userId },
        select: { providerId: true, accountId: true },
      }),
      this.providerConnections.model(tx).findMany({
        where: { userId },
        select: { provider: true, externalAthleteId: true },
      }),
    ]);
    return {
      authProviders: accounts.map((row) => ({
        providerId: String(row.providerId),
        accountId: String(row.accountId),
      })),
      externalProviders: connections.map((row) => ({
        provider: String(row.provider),
        externalAthleteId: row.externalAthleteId
          ? String(row.externalAthleteId)
          : null,
      })),
    };
  }

  private internalAvatarStorageKey(image: string | null | undefined) {
    const value = cleanKey(image);
    if (!value) return null;
    if (!value.startsWith('http://') && !value.startsWith('https://')) {
      return value;
    }
    try {
      const url = new URL(value);
      const configuredHosts = (process.env.ACCOUNT_DELETION_STORAGE_HOSTS ?? '')
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean);
      const configuredBaseUrls = [
        process.env.PUBLIC_ASSET_BASE_URL,
        process.env.NEXT_PUBLIC_ASSET_BASE_URL,
      ];
      for (const baseUrl of configuredBaseUrls) {
        if (!baseUrl) continue;
        try {
          configuredHosts.push(new URL(baseUrl).hostname.toLowerCase());
        } catch {}
      }
      const allowedHosts = new Set(configuredHosts);
      if (!allowedHosts.has(url.hostname.toLowerCase())) return null;
      return decodeURIComponent(url.pathname.replace(/^\/+/, '')) || null;
    } catch {
      return null;
    }
  }
}
