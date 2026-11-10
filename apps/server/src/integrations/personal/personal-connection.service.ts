import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import { Prisma, type ExternalProviderConnection } from '@prisma/client';
import type {
  PersonalProvider,
  PersonalRegion,
  PersonalSettings,
} from '@shared/personal-integrations';
import { PrismaService } from '@/prisma/prisma.service';
import { AthleteClockService } from '@/timezone/athlete-clock.service';
import { ExternalProviderConnectionService } from '@/integrations/external-provider/external-provider-connection.service';
import { ExternalProviderCredentialVault } from '../external-provider/external-provider-credential-vault.service';
import { ExternalProviderOAuthStateService } from '../external-provider/external-provider-oauth-state.service';
import {
  GarminPersonalClient,
  type GarminCredential,
} from '../garmin-personal/garmin-personal.client';
import {
  CorosMcpClient,
  type CorosCredential,
  type CorosTool,
  COROS_READ_TOOLS,
} from '../coros-mcp/coros-mcp.client';
import { PersonalProviderError, record, requireId } from './personal-errors';
import { validTimezone } from './personal-dates';
import { personalSyncJobResult } from './personal-sync-summary';
import { personalAccountRef } from './personal-identity';
import { matchesConfiguredBrowserOrigin } from '@/self-host/self-host-local-access-policy';

const settingsSchema = z
  .object({
    automatic: z.boolean(),
    activities: z.boolean(),
    wellness: z.boolean(),
    allowWrites: z.boolean(),
    timezone: z.string().max(100).optional(),
  })
  .strict();
export const defaultPersonalSettings: PersonalSettings = {
  automatic: true,
  activities: true,
  wellness: false,
  allowWrites: false,
  timezone: 'UTC',
};
export function personalMetadata(connection: ExternalProviderConnection) {
  return record(connection.metadata);
}
export function personalSettings(
  connection: ExternalProviderConnection,
): PersonalSettings {
  return {
    ...defaultPersonalSettings,
    ...record(personalMetadata(connection).settings),
  };
}
export function personalRegion(
  connection: ExternalProviderConnection,
): PersonalRegion {
  return personalMetadata(connection).region;
}
export function isPersonalConnection(connection: ExternalProviderConnection) {
  const mode = personalMetadata(connection).connectionMode;
  return (
    (connection.provider === 'garmin' && mode === 'personal_api') ||
    (connection.provider === 'coros' && mode === 'mcp')
  );
}
export function parsePersonalSettings(
  input: unknown,
  provider: PersonalProvider,
  timezone: string,
): PersonalSettings {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success)
    throw new PersonalProviderError(
      'PROVIDER_SETTINGS_INVALID',
      undefined,
      400,
    );
  if (provider === 'garmin' && parsed.data.allowWrites)
    throw new PersonalProviderError(
      'PROVIDER_DIRECTION_UNSUPPORTED',
      undefined,
      400,
    );
  return {
    automatic: parsed.data.automatic,
    activities: parsed.data.activities,
    wellness: parsed.data.wellness,
    allowWrites: parsed.data.allowWrites,
    timezone: validTimezone(timezone),
  };
}

@Injectable()
export class PersonalConnectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerConnections: ExternalProviderConnectionService,
    private readonly clock: AthleteClockService,
    private readonly vault: ExternalProviderCredentialVault,
    private readonly states: ExternalProviderOAuthStateService,
    private readonly garmin: GarminPersonalClient,
    private readonly coros: CorosMcpClient,
  ) {}

  /** Personal sync windows follow the account TIMEZONE metric, not a per-connection override. */
  async resolveAccountTimezone(userId: string): Promise<string> {
    return validTimezone((await this.clock.preferredTimezone(userId)) ?? 'UTC');
  }
  /**
   * Find a personal connection
   * @param userId
   * @param provider
   * @returns
   */
  async find(userId: string, provider: PersonalProvider) {
    const row = await this.providerConnections.model().findUnique({
      where: { userId_provider_region: { userId, provider, region: '' } },
    });
    if (row && !isPersonalConnection(row))
      throw new PersonalProviderError(
        'PROVIDER_CONNECTION_MODE_CONFLICT',
        undefined,
        409,
      );
    return row;
  }
  async require(userId: string, provider: PersonalProvider) {
    const row = await this.find(userId, provider);
    if (!row || row.status !== 'ACTIVE')
      throw new PersonalProviderError('PROVIDER_AUTH_REQUIRED', undefined, 401);
    return row;
  }
  async status(userId: string, provider: PersonalProvider) {
    const row = await this.find(userId, provider);
    if (!row)
      return {
        provider,
        connected: false,
        state: 'NOT_CONNECTED',
        settings: defaultPersonalSettings,
        jobs: [],
      };
    const jobs = await this.prisma.personalProviderJob.findMany({
      where: {
        connectionId: row.id,
        kind: { in: ['SYNC', 'WRITE'] },
        payload: { path: ['accountRef'], equals: personalAccountRef(row) },
      },
      orderBy: { createdAt: 'desc' },
      take: 2,
      select: {
        id: true,
        kind: true,
        status: true,
        result: true,
        errorCode: true,
        nextAttemptAt: true,
        createdAt: true,
        updatedAt: true,
        attempts: true,
        payload: true,
      },
    });
    const idsFor = (
      job: Pick<(typeof jobs)[number], 'kind' | 'result'>,
    ): string[] =>
      job.kind === 'SYNC' && Array.isArray(record(job.result).childIds)
        ? record(job.result).childIds.filter(
            (id: unknown) => typeof id === 'string',
          )
        : [];
    const childIds = [...new Set(jobs.flatMap(idsFor))];
    const children = childIds.length
      ? await this.prisma.personalProviderJob.findMany({
          where: { connectionId: row.id, id: { in: childIds } },
          select: { id: true, kind: true, status: true, result: true },
        })
      : [];
    const byId = new Map(children.map((child) => [child.id, child]));
    return {
      provider,
      connected: row.status === 'ACTIVE',
      state: row.status,
      region: personalRegion(row),
      accountId: row.externalAthleteId,
      credentialLast4: row.credentialLast4,
      settings: personalSettings(row),
      lastSyncCompletedAt: row.lastSyncCompletedAt,
      errorCode: row.lastError,
      jobs: jobs.map(({ payload, ...job }) => {
        const body = record(payload);
        return {
          ...job,
          startDate:
            typeof body.startDate === 'string' ? body.startDate : null,
          endDate: typeof body.endDate === 'string' ? body.endDate : null,
          trigger: typeof body.trigger === 'string' ? body.trigger : null,
          reconciling:
            job.kind === 'WRITE' &&
            job.status === 'UNKNOWN' &&
            row.status === 'ACTIVE' &&
            body.accountRef === personalAccountRef(row) &&
            job.attempts < 20,
          result:
            job.kind === 'SYNC'
              ? personalSyncJobResult(
                  job,
                  idsFor(job).flatMap((id) =>
                    byId.has(id) ? [byId.get(id)!] : [],
                  ),
                )
              : job.result,
        };
      }),
      tools:
        provider === 'coros' ? this.tools(row).map((tool) => tool.name) : [],
    };
  }
  private async save(
    userId: string,
    provider: PersonalProvider,
    accountId: string,
    region: PersonalRegion,
    settings: PersonalSettings,
    credential: GarminCredential | CorosCredential,
    tools: CorosTool[] = [],
    confirmed = false,
    expectedCredentialVersion?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Serialize first connections as well as replacements; no row exists to lock initially.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`personal-connect:${userId}:${provider}`}, 0))`;
      // Preserve metadata reservations committed by another worker before
      // reauthorization. The account lock also covers the first insertion.
      await tx.$executeRaw`SELECT id FROM t_external_provider_connection WHERE user_id=${userId} AND provider::text=${provider} FOR UPDATE`;
      const current = await this.providerConnections.model(tx).findUnique({
        where: { userId_provider_region: { userId, provider, region: '' } },
      });
      if (current && !isPersonalConnection(current))
        throw new PersonalProviderError(
          'PROVIDER_CONNECTION_MODE_CONFLICT',
          undefined,
          409,
        );
      if (
        expectedCredentialVersion !== undefined &&
        (current?.credentialFingerprint ?? null) !== expectedCredentialVersion
      )
        throw new PersonalProviderError(
          'PROVIDER_CONNECTION_CHANGED',
          undefined,
          409,
        );
      if (current && current.status !== 'DISCONNECTED' && !confirmed)
        throw new PersonalProviderError(
          'PROVIDER_RECONNECT_CONFIRM_REQUIRED',
          undefined,
          409,
        );
      // Keep sent/uncertain delivery receipts and account-scoped content keys.
      // Cancelling a RUNNING write as if unsent could create duplicates later.
      if (current) await this.cancelPending(tx, current.id);
      const data = {
        externalAthleteId: accountId,
        status: 'ACTIVE',
        credentialCiphertext: this.vault.encrypt(JSON.stringify(credential)),
        credentialLast4:
          provider === 'garmin'
            ? this.vault.last4((credential as GarminCredential).apiKey)
            : null,
        // This is an authorization generation, stable during token refresh.
        // Reusing the same still-valid token must still invalidate old work.
        credentialFingerprint: randomBytes(32).toString('hex'),
        lastError: null,
        syncActivities: settings.activities,
        syncScheduledActivities: settings.automatic,
        syncWellness: settings.wellness,
        exportActivities: false,
        exportWellness: false,
        syncSportSettings: false,
        exportSportSettings: false,
        lastSyncStartedAt: null,
        lastSyncCompletedAt: null,
        metadata: {
          connectionMode: provider === 'garmin' ? 'personal_api' : 'mcp',
          region,
          settings,
          tools,
          fitQuotas: current ? record(personalMetadata(current).fitQuotas) : {},
        } as unknown as Prisma.InputJsonValue,
      };
      if (!current)
        return this.providerConnections.model(tx).create({
          data: { userId, provider, ...data },
        });
      const changed = await this.providerConnections.model(tx).updateMany({
        where: {
          id: current.id,
          credentialFingerprint: current.credentialFingerprint,
        },
        data,
      });
      if (changed.count !== 1)
        throw new PersonalProviderError(
          'PROVIDER_CONNECTION_CHANGED',
          undefined,
          409,
        );
      return this.providerConnections.model(tx).findUniqueOrThrow({
        where: { id: current.id },
      });
    });
  }
  /**
   * Connect to Garmin personal API
   * @param userId
   * @param input
   * @returns
   */
  async connectGarmin(userId: string, input: unknown) {

    // Validate the input
    const body = z
      .object({
        apiKey: z.string().trim().min(8).max(4096),
        region: z.enum(['global', 'cn']),
        settings: settingsSchema,
        confirmed: z.boolean().optional(),
      })
      .strict()
      .safeParse(input);
    if (!body.success) {
      throw new PersonalProviderError(
        'PROVIDER_CONNECT_INVALID',
        undefined,
        400,
      );
    }

    const settings = parsePersonalSettings(
      body.data.settings,
      'garmin',
      await this.resolveAccountTimezone(userId),
    );

    // Check if the user already has a connection
    const existing = await this.find(userId, 'garmin');
    if (existing && existing.status !== 'DISCONNECTED' && !body.data.confirmed)
      throw new PersonalProviderError(
        'PROVIDER_RECONNECT_CONFIRM_REQUIRED',
        undefined,
        409,
      );
    const credential = await this.garmin.exchange(
      body.data.region,
      body.data.apiKey,
    );
    const profile = await this.garmin.profile(
      body.data.region,
      credential.token!,
      settings.timezone,
    );
    await this.save(
      userId,
      'garmin',
      profile.accountId,
      body.data.region,
      settings,
      credential,
      [],
      body.data.confirmed,
      existing?.credentialFingerprint ?? null,
    );
    return this.status(userId, 'garmin');
  }
  private appOrigin() {
    const raw =
      process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL;
    if (!raw)
      throw new PersonalProviderError(
        'PROVIDER_APP_URL_REQUIRED',
        undefined,
        503,
      );
    const url = new URL(raw);
    if (
      url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      )
    )
      throw new PersonalProviderError(
        'PROVIDER_OAUTH_HTTPS_REQUIRED',
        undefined,
        400,
      );
    return url.origin;
  }
  async startCoros(userId: string, input: unknown) {
    const parsed = z
      .object({
        region: z.enum(['us', 'eu', 'cn']),
        settings: settingsSchema,
        returnUrl: z.string().max(2048),
        confirmed: z.boolean().optional(),
      })
      .strict()
      .safeParse(input);
    if (!parsed.success)
      throw new PersonalProviderError(
        'PROVIDER_CONNECT_INVALID',
        undefined,
        400,
      );
    const body = parsed.data;
    const returnUrl = new URL(body.returnUrl, this.appOrigin());
    // Self-host binds 127.0.0.1 while SITE_ADDRESS defaults to localhost; treat
    // equivalent loopback hosts on the same protocol/port as the app origin.
    if (
      !matchesConfiguredBrowserOrigin(
        returnUrl.origin,
        new URL(this.appOrigin()),
      ) ||
      !/^\/(?:[a-z]{2,3}(?:-[a-zA-Z]{2,8})*\/)?account$/.test(
        returnUrl.pathname,
      )
    )
      throw new PersonalProviderError(
        'PROVIDER_RETURN_URL_INVALID',
        undefined,
        400,
      );
    const settings = parsePersonalSettings(
      body.settings,
      'coros',
      await this.resolveAccountTimezone(userId),
    );
    const existing = await this.find(userId, 'coros');
    if (existing && existing.status !== 'DISCONNECTED' && !body.confirmed)
      throw new PersonalProviderError(
        'PROVIDER_RECONNECT_CONFIRM_REQUIRED',
        undefined,
        409,
      );
    const redirectUri = `${this.appOrigin()}/api/coros-mcp/oauth/callback`;
    const registration = await this.coros.register(body.region, redirectUri);
    const verifier = randomBytes(32).toString('base64url');
    const state = await this.states.issue({
      userId,
      provider: 'coros',
      payload: {
        sealed: this.vault.encrypt(
          JSON.stringify({
            region: registration.region,
            clientId: registration.clientId,
            redirectUri,
            verifier,
            returnUrl: returnUrl.toString(),
            settings,
            confirmed: body.confirmed === true,
            expectedCredentialVersion: existing?.credentialFingerprint ?? null,
          }),
        ),
      },
    });
    const url = new URL(registration.metadata.authorization_endpoint);
    url.search = new URLSearchParams({
      client_id: registration.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid mcp.tools offline_access',
      resource: `${registration.origin}/mcp`,
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    }).toString();
    return { authorizationUrl: url.toString() };
  }
  async callback(code?: string, state?: string, denied?: string) {
    const row = await this.states.consume('coros', state);
    const stored = record(
      JSON.parse(this.vault.decrypt(record(row.payload).sealed)),
    );
    const target = new URL(stored.returnUrl);
    target.searchParams.set('personalProvider', 'coros');
    try {
      if (denied || !code || code.length > 4096)
        throw new PersonalProviderError(
          'PROVIDER_OAUTH_CANCELLED',
          undefined,
          400,
        );
      const credential = await this.coros.token(
        stored.region,
        stored.clientId,
        {
          grant_type: 'authorization_code',
          code,
          redirect_uri: stored.redirectUri,
          code_verifier: stored.verifier,
        },
      );
      const tools = await this.coros.tools(
        stored.region,
        credential.accessToken,
      );
      const profileTool = tools.find((tool) => tool.name === 'queryUserInfo');
      if (!profileTool)
        throw new PersonalProviderError('PROVIDER_TOOL_MISSING');
      const profile = record(
        await this.coros.call(
          stored.region,
          credential.accessToken,
          profileTool,
          {},
        ),
      );
      const accountId = requireId(
        profile.userId ??
          profile.id ??
          record(profile.data).userId ??
          record(profile.data).id,
      );
      await this.save(
        row.userId,
        'coros',
        accountId,
        stored.region,
        stored.settings,
        credential,
        tools,
        stored.confirmed,
        stored.expectedCredentialVersion,
      );
      target.searchParams.set('personalResult', 'connected');
      return {
        redirectUrl: target.toString(),
        connectedUserId: row.userId,
      };
    } catch (error) {
      target.searchParams.set(
        'personalResult',
        error instanceof PersonalProviderError
          ? error.code
          : 'PROVIDER_OAUTH_FAILED',
      );
    }
    return { redirectUrl: target.toString() };
  }
  async settings(userId: string, provider: PersonalProvider, input: unknown) {
    const settings = parsePersonalSettings(
      input,
      provider,
      await this.resolveAccountTimezone(userId),
    );
    const row = await this.require(userId, provider);
    const changed = await this.providerConnections.model().updateMany({
      where: { id: row.id, updatedAt: row.updatedAt },
      data: {
        syncActivities: settings.activities,
        syncScheduledActivities: settings.automatic,
        syncWellness: settings.wellness,
        metadata: {
          ...personalMetadata(row),
          settings,
        } as Prisma.InputJsonValue,
      },
    });
    if (changed.count !== 1)
      throw new PersonalProviderError('PROVIDER_BUSY', 5000, 409);
    return this.status(userId, provider);
  }
  async disconnect(userId: string, provider: PersonalProvider) {
    const row = await this.find(userId, provider);
    if (!row || row.status === 'DISCONNECTED')
      return { disconnected: true, revoked: provider !== 'coros' };
    // Erase secrets but retain the receipt ledger and account quota. Account
    // deletion still cascades these records; disconnect is not data deletion.
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`personal-connect:${userId}:${provider}`}, 0))`;
      const removed = await this.providerConnections.model(tx).updateMany({
        where: { id: row.id, credentialFingerprint: row.credentialFingerprint },
        data: {
          status: 'DISCONNECTED',
          credentialCiphertext: '',
          credentialLast4: null,
          credentialFingerprint: randomBytes(32).toString('hex'),
          syncActivities: false,
          syncScheduledActivities: false,
          syncWellness: false,
          exportActivities: false,
          exportWellness: false,
          syncSportSettings: false,
          exportSportSettings: false,
          lastError: null,
        },
      });
      if (removed.count !== 1)
        throw new PersonalProviderError(
          'PROVIDER_CONNECTION_CHANGED',
          undefined,
          409,
        );
      await this.cancelPending(tx, row.id);
    });
    let revoked = provider !== 'coros';
    if (provider === 'coros') {
      try {
        const credential = JSON.parse(
          this.vault.decrypt(row.credentialCiphertext),
        );
        revoked = await this.coros.revoke(personalRegion(row), credential);
      } catch {
        revoked = false;
      }
    }
    return { disconnected: true, revoked };
  }
  private async cancelPending(
    tx: Prisma.TransactionClient,
    connectionId: string,
  ) {
    await tx.personalProviderJob.updateMany({
      where: { connectionId, kind: 'WRITE', status: 'RUNNING' },
      data: {
        status: 'UNKNOWN',
        errorCode: 'PROVIDER_RESULT_UNKNOWN',
        leaseUntil: null,
        nextAttemptAt: new Date(),
      },
    });
    await tx.personalProviderJob.updateMany({
      where: {
        connectionId,
        status: { in: ['PREVIEW', 'QUEUED', 'RUNNING', 'WAITING'] },
      },
      data: { status: 'CANCELLED', leaseUntil: null, dedupKey: null },
    });
  }
  /** Serialize rotating tokens in PostgreSQL, including across server processes. */
  async credential(
    connectionId: string,
    force = false,
    rejectedToken?: string,
  ): Promise<{ connection: ExternalProviderConnection; token: string }> {
    return this.prisma.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<
          Array<{ locked: boolean }>
        >`SELECT pg_try_advisory_xact_lock(hashtextextended(${`personal-token:${connectionId}`}, 0)) AS locked`;
        if (!lock.locked)
          throw new PersonalProviderError('PROVIDER_BUSY', 5000, 409);
        let connection = await this.providerConnections.model(tx).findUnique({
          where: { id: connectionId },
        });
        if (
          !connection ||
          !isPersonalConnection(connection) ||
          connection.status !== 'ACTIVE'
        )
          throw new PersonalProviderError(
            'PROVIDER_AUTH_REQUIRED',
            undefined,
            401,
          );
        const old = JSON.parse(
          this.vault.decrypt(connection.credentialCiphertext),
        );
        let credential = old;
        const oldToken =
          connection.provider === 'garmin' ? old.token : old.accessToken;
        if (
          (force && (!rejectedToken || rejectedToken === oldToken)) ||
          !old.expiresAt ||
          old.expiresAt - 60_000 <= Date.now()
        ) {
          if (connection.provider === 'garmin')
            credential = await this.garmin.exchange(
              personalRegion(connection),
              old.apiKey,
            );
          else {
            if (!old.refreshToken)
              throw new PersonalProviderError(
                'PROVIDER_AUTH_REQUIRED',
                undefined,
                401,
              );
            credential = await this.coros.token(
              personalRegion(connection),
              old.clientId,
              { grant_type: 'refresh_token', refresh_token: old.refreshToken },
            );
            credential.refreshToken ??= old.refreshToken;
          }
          const changed = await this.providerConnections.model(tx).updateMany({
            where: {
              id: connection.id,
              credentialCiphertext: connection.credentialCiphertext,
              status: 'ACTIVE',
            },
            data: {
              credentialCiphertext: this.vault.encrypt(
                JSON.stringify(credential),
              ),
            },
          });
          if (changed.count !== 1)
            throw new PersonalProviderError(
              'PROVIDER_CONNECTION_CHANGED',
              undefined,
              409,
            );
        }
        return {
          connection,
          token:
            connection.provider === 'garmin'
              ? credential.token
              : credential.accessToken,
        };
      },
      { timeout: 90_000 },
    );
  }
  async authorized<T>(
    connectionId: string,
    work: (connection: ExternalProviderConnection, token: string) => Promise<T>,
  ): Promise<T> {
    const observed = await this.providerConnections.model().findUnique({
      where: { id: connectionId },
    });
    try {
      let active = await this.credential(connectionId);
      try {
        return await work(active.connection, active.token);
      } catch (error) {
        if (
          !(error instanceof PersonalProviderError) ||
          error.code !== 'PROVIDER_AUTH_REQUIRED'
        )
          throw error;
        active = await this.credential(connectionId, true, active.token);
        return await work(active.connection, active.token);
      }
    } catch (error) {
      if (
        error instanceof PersonalProviderError &&
        error.code === 'PROVIDER_AUTH_REQUIRED' &&
        observed &&
        isPersonalConnection(observed)
      ) {
        await this.prisma.$transaction(async (tx) => {
          const invalidated = await this.providerConnections.model(tx).updateMany({
            where: {
              id: connectionId,
              status: 'ACTIVE',
              credentialFingerprint: observed.credentialFingerprint,
            },
            data: { status: 'INVALID', lastError: error.code },
          });
          if (invalidated.count)
            await tx.personalProviderJob.updateMany({
              where: {
                connectionId,
                kind: { not: 'WRITE' },
                status: { in: ['QUEUED', 'RUNNING', 'WAITING'] },
              },
              data: {
                status: 'FAILED',
                errorCode: error.code,
                leaseUntil: null,
              },
            });
        });
      }
      throw error;
    }
  }
  tools(connection: ExternalProviderConnection): CorosTool[] {
    const tools = personalMetadata(connection).tools;
    return Array.isArray(tools) ? (tools as CorosTool[]) : [];
  }
  async readCoros(
    connectionId: string,
    name: string,
    args: Record<string, unknown>,
  ) {
    if (!COROS_READ_TOOLS.includes(name as never))
      throw new PersonalProviderError(
        'PROVIDER_TOOL_NOT_ALLOWED',
        undefined,
        400,
      );
    return this.authorized(connectionId, (connection, token) => {
      const tool = this.tools(connection).find((item) => item.name === name);
      if (!tool) throw new PersonalProviderError('PROVIDER_TOOL_MISSING');
      return this.coros.call(personalRegion(connection), token, tool, args);
    });
  }
}
