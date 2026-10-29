import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  BadRequestException,
} from '@nestjs/common';
import {
  MetricSource,
  Prisma,
  SelfHostInitializationState,
  SportType,
  UserAcquisitionSource,
  UserFitnessMetricType,
  UserRegistrationMethod,
  UserRegistrationPlatform,
} from '@prisma/client';
import { hashPassword } from '@better-auth/utils/password';
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { acquireNumericAdvisoryXactLock } from '@/prisma/numeric-advisory-lock';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import { UserQueryService } from '@/api/user/user-query.service';
import {
  PASSWORD_POLICY_MESSAGE,
  passwordMeetsPolicy,
} from '@/auth/password-policy';
import {
  BootstrapLocalOwnerInput,
  BootstrapLocalOwnerResult,
  BootstrapOwnerInput,
  BootstrapOwnerResult,
  SELF_HOST_INSTANCE_ID,
  SelfHostBootstrapError,
  SelfHostBootstrapStatus,
  SelfHostSessionPolicy,
} from './self-host-bootstrap.types';
import { resolveSelfHostAccessMode } from './self-host-local-access-policy';
import {
  readBootstrapTokenFile,
  removeBootstrapTokenFile,
  selfHostBootstrapTokenPath,
  writeBootstrapTokenFile,
} from './self-host-token-file';

const BOOTSTRAP_LOCK_ID = 7_257_209_788_430_862;
const DEFAULT_TOKEN_TTL_SECONDS = 24 * 60 * 60;
const MIN_TOKEN_TTL_SECONDS = 10 * 60;
const MAX_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const OWNER_NAME_REGEX = /^[\u4e00-\u9fa5a-zA-Z0-9\s\-_]+$/;

function tokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function digestsMatch(token: string, expectedHex: string | null): boolean {
  if (!token || !expectedHex || !/^[a-f0-9]{64}$/i.test(expectedHex)) {
    return false;
  }
  const actual = Buffer.from(tokenDigest(token), 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return timingSafeEqual(actual, expected);
}

function tokenTtlSeconds(env: NodeJS.ProcessEnv): number {
  const raw = env.SELF_HOST_BOOTSTRAP_TOKEN_TTL_SECONDS?.trim();
  if (!raw) return DEFAULT_TOKEN_TTL_SECONDS;
  const parsed = Number(raw);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < MIN_TOKEN_TTL_SECONDS ||
    parsed > MAX_TOKEN_TTL_SECONDS
  ) {
    throw new Error(
      `SELF_HOST_BOOTSTRAP_TOKEN_TTL_SECONDS must be an integer between ${MIN_TOKEN_TTL_SECONDS} and ${MAX_TOKEN_TTL_SECONDS}`,
    );
  }
  return parsed;
}

function normalizeOwnerInput(input: BootstrapOwnerInput): BootstrapOwnerInput {
  const normalized = {
    token: String(input?.token ?? '').trim(),
    email: String(input?.email ?? '')
      .trim()
      .toLowerCase(),
    password: String(input?.password ?? ''),
    name: String(input?.name ?? '').trim(),
  };
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email);
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(normalized.token) ||
    !emailValid ||
    normalized.name.length < 1 ||
    normalized.name.length > 20 ||
    !OWNER_NAME_REGEX.test(normalized.name) ||
    !passwordMeetsPolicy(normalized.password)
  ) {
    throw new SelfHostBootstrapError('SELF_HOST_BOOTSTRAP_INPUT_INVALID');
  }
  return normalized;
}

function normalizeLocalOwnerInput(
  input: BootstrapLocalOwnerInput,
): BootstrapLocalOwnerInput {
  const name = String(input?.name ?? '').trim();
  if (name.length < 1 || name.length > 20 || !OWNER_NAME_REGEX.test(name)) {
    throw new SelfHostBootstrapError('SELF_HOST_BOOTSTRAP_INPUT_INVALID');
  }
  return { name };
}

async function acquireBootstrapLock(tx: Prisma.TransactionClient) {
  await acquireNumericAdvisoryXactLock(tx, BOOTSTRAP_LOCK_ID);
}

@Injectable()
export class SelfHostBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SelfHostBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runtimeCapabilities: RuntimeCapabilityService,
    private readonly users: UserQueryService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.isSelfHost()) return;
    const status = await this.ensureBootstrapToken();
    if (status.bootstrapRequired) {
      if (status.accessMode === 'local-owner') {
        this.logger.warn(
          '[self-host] owner initialization is pending; finish the local first-run setup in the browser',
        );
      } else {
        this.logger.warn(
          `[self-host] owner initialization is pending; the one-time token is stored at ${selfHostBootstrapTokenPath()}`,
        );
      }
    }
  }

  private isSelfHost(): boolean {
    return this.runtimeCapabilities.snapshot().deployment === 'self-host';
  }

  private assertSelfHost(): void {
    if (!this.isSelfHost()) {
      throw new SelfHostBootstrapError('SELF_HOST_ONLY');
    }
  }

  async getSessionPolicy(userId: string): Promise<SelfHostSessionPolicy> {
    this.assertSelfHost();
    const instance = await this.prisma.selfHostInstance.findUnique({
      where: { id: SELF_HOST_INSTANCE_ID },
      select: { state: true, ownerUserId: true },
    });
    const accessMode = resolveSelfHostAccessMode();
    const isOwner =
      instance?.state === SelfHostInitializationState.READY &&
      instance.ownerUserId === userId;

    return {
      schemaVersion: 1,
      accessMode,
      isOwner,
      canSignOut: accessMode === 'credentials',
      canDeleteAccount: !isOwner || accessMode === 'local-owner',
    };
  }

  /**
   * Atomically detach the passwordless local Owner before its user row is
   * deleted. A fresh one-time token keeps the database invariant valid; the
   * browser setup path does not expose or require that token.
   */
  async resetForLocalOwnerDeletion(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<boolean> {
    if (!this.isSelfHost() || resolveSelfHostAccessMode() !== 'local-owner') {
      return false;
    }
    const instance = await tx.selfHostInstance.findUnique({
      where: { id: SELF_HOST_INSTANCE_ID },
      select: { state: true, ownerUserId: true },
    });
    if (
      instance?.state !== SelfHostInitializationState.READY ||
      instance.ownerUserId !== userId
    ) {
      return false;
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + tokenTtlSeconds(process.env) * 1000,
    );
    await writeBootstrapTokenFile(token);
    await tx.selfHostInstance.update({
      where: { id: SELF_HOST_INSTANCE_ID },
      data: {
        state: SelfHostInitializationState.PENDING,
        bootstrapTokenHash: tokenDigest(token),
        bootstrapTokenExpiresAt: expiresAt,
        ownerUserId: null,
        initializedAt: null,
        aiProvider: null,
        aiBaseUrl: null,
        aiDefaultModel: null,
        aiDefaultModelContextTokens: null,
        aiReasoningModel: null,
        aiReasoningModelContextTokens: null,
        aiWebSearchEnabled: false,
        aiApiKeyEncrypted: null,
        aiConfigUpdatedAt: null,
      },
    });
    return true;
  }

  async ensureBootstrapToken(): Promise<SelfHostBootstrapStatus> {
    this.assertSelfHost();
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await acquireBootstrapLock(tx);
      const instance = await tx.selfHostInstance.findUnique({
        where: { id: SELF_HOST_INSTANCE_ID },
      });
      if (instance?.state === SelfHostInitializationState.READY) {
        return { state: 'READY' as const, expiresAt: null };
      }

      const fileToken = await readBootstrapTokenFile();
      const reusable = Boolean(
        instance?.bootstrapTokenExpiresAt &&
        instance.bootstrapTokenExpiresAt > now &&
        fileToken &&
        digestsMatch(fileToken, instance.bootstrapTokenHash),
      );
      if (reusable) {
        return {
          state: 'PENDING' as const,
          expiresAt: instance!.bootstrapTokenExpiresAt!,
        };
      }

      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(
        now.getTime() + tokenTtlSeconds(process.env) * 1000,
      );
      await writeBootstrapTokenFile(token);
      await tx.selfHostInstance.upsert({
        where: { id: SELF_HOST_INSTANCE_ID },
        create: {
          id: SELF_HOST_INSTANCE_ID,
          state: SelfHostInitializationState.PENDING,
          bootstrapTokenHash: tokenDigest(token),
          bootstrapTokenExpiresAt: expiresAt,
        },
        update: {
          state: SelfHostInitializationState.PENDING,
          bootstrapTokenHash: tokenDigest(token),
          bootstrapTokenExpiresAt: expiresAt,
          ownerUserId: null,
          initializedAt: null,
        },
      });
      return { state: 'PENDING' as const, expiresAt };
    });

    if (result.state === 'READY') {
      await removeBootstrapTokenFile().catch((error) => {
        this.logger.warn(
          `[self-host] failed to remove an obsolete bootstrap token file: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }
    const accessMode = resolveSelfHostAccessMode();
    return {
      schemaVersion: 1,
      state: result.state,
      bootstrapRequired: result.state === 'PENDING',
      accessMode,
      browserSetupAvailable: accessMode === 'local-owner',
      tokenExpiresAt: result.expiresAt?.toISOString() ?? null,
      mailRecoveryAvailable: this.runtimeCapabilities.isEnabled('mail'),
    };
  }

  async bootstrapLocalOwner(
    rawInput: BootstrapLocalOwnerInput,
  ): Promise<BootstrapLocalOwnerResult> {
    this.assertSelfHost();
    if (resolveSelfHostAccessMode() !== 'local-owner') {
      throw new SelfHostBootstrapError('SELF_HOST_LOCAL_ACCESS_DISABLED');
    }
    const input = normalizeLocalOwnerInput(rawInput);
    const initializedAt = new Date();
    const userId = randomUUID();
    const internalEmail = `owner-${userId}@self-host.invalid`;

    const result = await this.prisma.$transaction(async (tx) => {
      await acquireBootstrapLock(tx);
      const instance = await tx.selfHostInstance.findUnique({
        where: { id: SELF_HOST_INSTANCE_ID },
      });
      if (instance?.state === SelfHostInitializationState.READY) {
        throw new SelfHostBootstrapError('SELF_HOST_ALREADY_INITIALIZED');
      }

      await this.users.users(tx).create({
        data: {
          id: userId,
          name: input.name,
          email: internalEmail,
          emailVerified: true,
          createdAt: initializedAt,
          updatedAt: initializedAt,
          registrationPlatform: UserRegistrationPlatform.WEB,
          registrationMethod: UserRegistrationMethod.UNKNOWN,
          acquisitionSource: UserAcquisitionSource.INTERNAL,
        },
      });
      await this.users.fitnessMetrics(tx).create({
        data: {
          userId,
          type: UserFitnessMetricType.RESTING_HR,
          sport: SportType.UNKNOWN,
          source: MetricSource.MANUAL,
          value: 60,
          recordedAt: new Date(
            Date.UTC(
              initializedAt.getUTCFullYear(),
              initializedAt.getUTCMonth(),
              initializedAt.getUTCDate(),
            ),
          ),
        },
      });
      await tx.selfHostInstance.upsert({
        where: { id: SELF_HOST_INSTANCE_ID },
        create: {
          id: SELF_HOST_INSTANCE_ID,
          state: SelfHostInitializationState.READY,
          ownerUserId: userId,
          initializedAt,
        },
        update: {
          state: SelfHostInitializationState.READY,
          ownerUserId: userId,
          initializedAt,
          bootstrapTokenHash: null,
          bootstrapTokenExpiresAt: null,
        },
      });
      return {
        schemaVersion: 1 as const,
        state: 'READY' as const,
        accessMode: 'local-owner' as const,
        owner: { name: input.name },
        initializedAt: initializedAt.toISOString(),
      };
    });

    await removeBootstrapTokenFile().catch((error) => {
      this.logger.warn(
        `[self-host] owner is initialized but the obsolete token file could not be removed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    return result;
  }

  async bootstrapOwner(
    rawInput: BootstrapOwnerInput,
  ): Promise<BootstrapOwnerResult> {
    this.assertSelfHost();
    const input = normalizeOwnerInput(rawInput);
    const preliminary = await this.prisma.selfHostInstance.findUnique({
      where: { id: SELF_HOST_INSTANCE_ID },
    });
    this.assertTokenCanBeUsed(preliminary, input.token);

    // Hash only after a cheap token check so unauthenticated traffic cannot use
    // the password KDF as an amplification primitive. The token is checked
    // again under the advisory lock before any write.
    const passwordHash = await hashPassword(input.password);
    const initializedAt = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await acquireBootstrapLock(tx);
      const instance = await tx.selfHostInstance.findUnique({
        where: { id: SELF_HOST_INSTANCE_ID },
      });
      this.assertTokenCanBeUsed(instance, input.token);

      const existingUser = await this.users.users(tx).findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (existingUser) {
        throw new SelfHostBootstrapError('SELF_HOST_BOOTSTRAP_EMAIL_IN_USE');
      }

      const userId = randomUUID();
      await this.users.users(tx).create({
        data: {
          id: userId,
          name: input.name,
          email: input.email,
          emailVerified: true,
          createdAt: initializedAt,
          updatedAt: initializedAt,
          registrationPlatform: UserRegistrationPlatform.WEB,
          registrationMethod: UserRegistrationMethod.EMAIL,
          acquisitionSource: UserAcquisitionSource.INTERNAL,
        },
      });
      await tx.t_user_accounts.create({
        data: {
          id: randomUUID(),
          accountId: userId,
          providerId: 'credential',
          userId,
          password: passwordHash,
          createdAt: initializedAt,
          updatedAt: initializedAt,
        },
      });
      await this.users.fitnessMetrics(tx).create({
        data: {
          userId,
          type: UserFitnessMetricType.RESTING_HR,
          sport: SportType.UNKNOWN,
          source: MetricSource.MANUAL,
          value: 60,
          recordedAt: new Date(
            Date.UTC(
              initializedAt.getUTCFullYear(),
              initializedAt.getUTCMonth(),
              initializedAt.getUTCDate(),
            ),
          ),
        },
      });
      await tx.selfHostInstance.update({
        where: { id: SELF_HOST_INSTANCE_ID },
        data: {
          state: SelfHostInitializationState.READY,
          ownerUserId: userId,
          initializedAt,
          bootstrapTokenHash: null,
          bootstrapTokenExpiresAt: null,
        },
      });
      return {
        schemaVersion: 1 as const,
        state: 'READY' as const,
        owner: { email: input.email, name: input.name },
        initializedAt: initializedAt.toISOString(),
      };
    });

    await removeBootstrapTokenFile().catch((error) => {
      this.logger.warn(
        `[self-host] owner is initialized but the obsolete token file could not be removed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    return result;
  }

  private assertTokenCanBeUsed(
    instance: {
      state: SelfHostInitializationState;
      bootstrapTokenHash: string | null;
      bootstrapTokenExpiresAt: Date | null;
    } | null,
    token: string,
  ): void {
    if (instance?.state === SelfHostInitializationState.READY) {
      throw new SelfHostBootstrapError('SELF_HOST_ALREADY_INITIALIZED');
    }
    if (
      !instance?.bootstrapTokenExpiresAt ||
      instance.bootstrapTokenExpiresAt.getTime() <= Date.now()
    ) {
      throw new SelfHostBootstrapError('SELF_HOST_BOOTSTRAP_TOKEN_EXPIRED');
    }
    if (!digestsMatch(token, instance.bootstrapTokenHash)) {
      throw new SelfHostBootstrapError('SELF_HOST_BOOTSTRAP_TOKEN_INVALID');
    }
  }

  toHttpException(error: unknown): Error {
    if (!(error instanceof SelfHostBootstrapError)) {
      return error instanceof Error ? error : new Error(String(error));
    }
    const body = { code: error.code, message: error.code };
    switch (error.code) {
      case 'SELF_HOST_ONLY':
      case 'SELF_HOST_LOCAL_ACCESS_DISABLED':
        return new NotFoundException(body);
      case 'SELF_HOST_ALREADY_INITIALIZED':
      case 'SELF_HOST_BOOTSTRAP_EMAIL_IN_USE':
        return new ConflictException(body);
      case 'SELF_HOST_BOOTSTRAP_TOKEN_EXPIRED':
        return new GoneException(body);
      case 'SELF_HOST_BOOTSTRAP_TOKEN_INVALID':
      case 'SELF_HOST_LOCAL_ACCESS_FORBIDDEN':
        return new ForbiddenException(body);
      case 'SELF_HOST_BOOTSTRAP_INPUT_INVALID':
        return new BadRequestException({
          ...body,
          passwordPolicy: PASSWORD_POLICY_MESSAGE,
        });
    }
  }
}
