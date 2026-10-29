import { betterAuth, type Auth } from 'better-auth';
import { APIError, createAuthMiddleware, getOAuthState } from 'better-auth/api';
import { bearer, emailOTP, jwt } from 'better-auth/plugins';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '@prisma/client';
import { readAuthSecurityConfig } from './auth/auth-security-config';
import { createBetterAuthRateLimitStorage } from './auth/auth-rate-limit-store';
import { assertEmailLoginAllowed } from './auth/login-rate-limit';
import { Logger } from '@nestjs/common';
import { seedDefaultRestingHeartRateIfAbsent } from './api/user/persistence/user-fitness-defaults';
const authLifecycleLogger = new Logger('BetterAuth');
import { assertEmailAuthAccountNotBeingDeleted } from './auth/account-deletion-auth-guard';
import { resolveRegistrationAttribution } from './auth/registration-attribution';
import { findAccountDeletionStateById } from './api/user/persistence/user-auth.repository';
import { resolveAuthCookiePolicy } from './auth/auth-cookie-policy';
import {
  PASSWORD_POLICY_MESSAGE,
  passwordMeetsPolicy,
} from './auth/password-policy';
import { isSelfHostMailAuthPathAllowed } from './auth/self-host-mail-auth-policy';
import { publicSignupBlockReason } from './auth/signup-policy';
import { selfHostLocalOwner } from './auth/self-host-local-owner.plugin';
import { buildTrustedOrigins } from './auth/trusted-origins';
import {
  getDeploymentAuthPlugins,
  getDeploymentAuthMailDelivery,
  getDeploymentTrustedOrigins,
  getDeploymentSocialProviders,
  type AuthOtpEmailType,
  type DeploymentAuthPluginContext,
} from './auth/deployment-auth-plugins';
import {
  resolveSupportedLocale,
  type SupportedAppLocale,
} from './utils/locale.util';
// 通过内部 API 调用服务端的 MailController，避免绕过 Nest DI

// 获取基础 URL 的函数
const getBaseUrl = () => {
  // Cloud 和公网 Self-host 必须显式配置公开地址；loopback 仅作为本地默认值。
  return (
    process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, '') ||
    process.env.BETTER_AUTH_URL?.trim().replace(/\/+$/, '') ||
    `http://127.0.0.1:${process.env.PORT || '3001'}`
  );
};

const getAppBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_APP_URL?.trim()) {
    return process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/+$/, '');
  }
  if (process.env.NEXT_PUBLIC_BASE_URL?.trim()) {
    return process.env.NEXT_PUBLIC_BASE_URL.trim().replace(/\/+$/, '');
  }
  return 'http://127.0.0.1:3000';
};

const getOAuthResourceUrls = (baseUrl: string) => {
  const normalized = String(baseUrl).replace(/\/+$/, '');
  return [`${normalized}/oauth`, `${normalized}/mcp`];
};

const getDeploymentAuthContext = (): DeploymentAuthPluginContext => {
  const baseUrl = getBaseUrl();
  return {
    baseUrl,
    appBaseUrl: getAppBaseUrl(),
    authIssuer: `${baseUrl.replace(/\/+$/, '')}/auth`,
    oauthResourceUrls: getOAuthResourceUrls(baseUrl),
  };
};

const selfHostMailDisabledError = () =>
  Object.assign(new Error('Authentication email delivery is not configured'), {
    code: 'SELF_HOST_MAIL_DISABLED',
  });

const AUTH_PASSWORD_WRITE_PATHS = new Set([
  '/sign-up/email',
  '/reset-password',
  '/change-password',
  '/set-password',
  '/email-otp/reset-password',
]);

const readTrimmedEnv = (key: string) => {
  const value = process.env[key]?.trim();
  return value ? value : null;
};

const AUTH_ERROR_MESSAGES: Record<
  string,
  Record<SupportedAppLocale, string>
> = {
  INVALID_EMAIL_OR_PASSWORD: {
    en: 'Invalid email or password',
    zh: '邮箱或密码错误',
    'zh-hant': '電郵或密碼錯誤',
    ja: 'メールアドレスまたはパスワードが正しくありません',
    de: 'Invalid email or password',
    fr: 'Invalid email or password',
    ko: 'Invalid email or password',
    es: 'Invalid email or password',
    'pt-BR': 'Invalid email or password',
    it: 'Invalid email or password',
  },
  INVALID_EMAIL: {
    en: 'Invalid email',
    zh: '邮箱格式无效',
    'zh-hant': '電郵格式無效',
    ja: 'メールアドレスの形式が正しくありません',
    de: 'Invalid email',
    fr: 'Invalid email',
    ko: 'Invalid email',
    es: 'Invalid email',
    'pt-BR': 'Invalid email',
    it: 'Invalid email',
  },
  EMAIL_NOT_VERIFIED: {
    en: 'Email not verified',
    zh: '邮箱尚未验证',
    'zh-hant': '電郵尚未驗證',
    ja: 'メールアドレスが未確認です',
    de: 'Email not verified',
    fr: 'Email not verified',
    ko: 'Email not verified',
    es: 'Email not verified',
    'pt-BR': 'Email not verified',
    it: 'Email not verified',
  },
  USER_ALREADY_EXISTS: {
    en: 'User already exists',
    zh: '该邮箱已注册',
    'zh-hant': '此電郵已註冊',
    ja: 'このメールアドレスはすでに登録されています',
    de: 'User already exists',
    fr: 'User already exists',
    ko: 'User already exists',
    es: 'User already exists',
    'pt-BR': 'User already exists',
    it: 'User already exists',
  },
  ACCOUNT_DELETION_IN_PROGRESS: {
    en: 'Your account deletion request is already being processed.',
    zh: '账户删除申请正在处理中。',
    'zh-hant': '帳戶刪除請求正在處理中。',
    ja: 'アカウント削除リクエストはすでに処理中です。',
    de: 'Die Löschung deines Kontos wird bereits bearbeitet.',
    fr: 'La suppression de votre compte est déjà en cours de traitement.',
    ko: '계정 삭제 요청을 이미 처리 중입니다.',
    es: 'La solicitud de eliminación de tu cuenta ya se está procesando.',
    'pt-BR': 'A solicitação de exclusão da sua conta já está sendo processada.',
    it: 'La richiesta di eliminazione dell’account è già in elaborazione.',
  },
  PASSWORD_TOO_SHORT: {
    en: 'Password too short',
    zh: '密码太短',
    'zh-hant': '密碼太短',
    ja: 'パスワードが短すぎます',
    de: 'Password too short',
    fr: 'Password too short',
    ko: 'Password too short',
    es: 'Password too short',
    'pt-BR': 'Password too short',
    it: 'Password too short',
  },
  PASSWORD_TOO_LONG: {
    en: 'Password too long',
    zh: '密码太长',
    'zh-hant': '密碼太長',
    ja: 'パスワードが長すぎます',
    de: 'Password too long',
    fr: 'Password too long',
    ko: 'Password too long',
    es: 'Password too long',
    'pt-BR': 'Password too long',
    it: 'Password too long',
  },
};

function resolveAuthLocale(headers?: Headers): SupportedAppLocale {
  return resolveSupportedLocale(
    headers?.get('x-lang') || headers?.get('accept-language') || '',
  );
}

/** better-auth adapter 专用 Prisma 实例（与 Nest PrismaService 分离） */
const prismaAuthAdapter = new PrismaClient();

function localizeAuthError(returned: unknown, headers?: Headers) {
  // 直接改写 better-auth 返回体，保持 status/code 不变，只替换 message。
  const error = returned as
    | {
        body?: { code?: string; message?: string };
      }
    | undefined;
  const code = error?.body?.code;
  if (!code) return null;

  const locale = resolveAuthLocale(headers);
  const message = AUTH_ERROR_MESSAGES[code]?.[locale];
  if (!message || !error?.body) return;

  error.body.code = code;
  error.body.message = message;
}

function getPasswordFromAuthWriteBody(path: string, body: unknown) {
  if (!AUTH_PASSWORD_WRITE_PATHS.has(path)) return null;
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const value =
    path === '/sign-up/email' || path === '/email-otp/reset-password'
      ? record.password
      : record.newPassword;
  return typeof value === 'string' ? value : null;
}

function assertPasswordPolicyForAuthWrite(path: string, body: unknown) {
  const password = getPasswordFromAuthWriteBody(path, body);
  if (password == null) return;
  if (passwordMeetsPolicy(password)) return;
  throw new APIError('BAD_REQUEST', {
    code: 'INVALID_PASSWORD_FORMAT',
    message: PASSWORD_POLICY_MESSAGE,
  });
}

type AuthHookContext = {
  path?: unknown;
  body?: unknown;
  headers?: unknown;
  request?: { url?: unknown };
};

function asAuthHookContext(value: unknown): AuthHookContext {
  if (!value || typeof value !== 'object') return {};
  return value as AuthHookContext;
}

function asAuthHeaders(value: unknown): Headers | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (value instanceof Headers) return value;
  if (
    'get' in value &&
    typeof (value as { get?: unknown }).get === 'function'
  ) {
    return value as Headers;
  }
  return undefined;
}

export async function sendOtpEmailInternal(args: {
  email: string;
  otp: string;
  type: AuthOtpEmailType;
  headers?: Headers;
  lang?: string;
}) {
  const delivery = getDeploymentAuthMailDelivery(getDeploymentAuthContext());
  if (!delivery) throw selfHostMailDisabledError();
  await delivery.sendOtp(args);
}

async function sendPasswordResetEmailInternal(args: {
  email: string;
  url: string;
  headers?: Headers;
}) {
  const delivery = getDeploymentAuthMailDelivery(getDeploymentAuthContext());
  if (!delivery) throw selfHostMailDisabledError();
  await delivery.sendPasswordReset(args);
}

/**
 * betterAuth 的具体实例带部署插件，declaration emit 写不下。
 * `ReturnType<typeof betterAuth>` 又会收成不含插件的默认泛型。
 * 用 Auth 加上实际用到的插件方法，既可序列化，又不丢 OTP / OAuth metadata。
 */
type AuthPluginApi = {
  createVerificationOTP: (args: {
    body: { email: string; type: string };
    request?: globalThis.Request;
  }) => Promise<unknown>;
  sendVerificationOTP: (args: {
    body: { email: string; type: string };
    request?: globalThis.Request;
  }) => Promise<unknown>;
  verifyEmailOTP: (args: {
    body: { email: string; otp: string };
    headers?: Headers;
  }) => Promise<unknown>;
  getOAuthServerConfig: (...args: unknown[]) => unknown;
  getOpenIdConfig: (...args: unknown[]) => unknown;
};

type AuthInstance = Auth & { api: AuthPluginApi };

// 创建一个函数来获取 auth 配置，确保环境变量已加载
export const getAuthConfig = (): AuthInstance => {
  const authSecurity = readAuthSecurityConfig();
  // 延迟构建配置，确保 dotenv/config 已经完成加载。
  const baseUrl = getBaseUrl();
  const appBaseUrl = getAppBaseUrl();
  const authIssuer = `${String(baseUrl).replace(/\/+$/, '')}/auth`;
  const oauthResourceUrls = getOAuthResourceUrls(baseUrl);
  const isProduction = process.env.NODE_ENV === 'production';
  const domainBase = process.env.DOMAIN_BASE || 'trainingload';
  const selfHost = Boolean(readTrimmedEnv('SELF_HOST_MODE'));
  const authCookiePolicy = resolveAuthCookiePolicy({
    production: isProduction,
    selfHost,
    publicBaseUrl: baseUrl,
    managedDomainBase: domainBase,
  });
  const deploymentAuthContext = getDeploymentAuthContext();
  return betterAuth({
    basePath: '/auth',
    rateLimit: {
      enabled: authSecurity.betterAuthRateLimit.enabled,
      window: authSecurity.betterAuthRateLimit.windowSeconds,
      max: authSecurity.betterAuthRateLimit.maxRequests,
      storage: 'database',
      customStorage: createBetterAuthRateLimitStorage(
        prismaAuthAdapter,
        (error) => {
          authLifecycleLogger.error(
            '原子限流计数写入失败',
            error instanceof Error ? error.stack : String(error),
          );
        },
      ),
      modelName: 'authRateLimit',
      customRules: {
        // Session reads are invoked during logout/login transitions and by
        // multiple mounted clients. Credential and OTP endpoints retain their
        // strict rules, while Caddy still applies the general API rate limit.
        '/get-session': false,
        '/sign-in/email': {
          window: authSecurity.betterAuthRateLimit.windowSeconds,
          max: authSecurity.betterAuthRateLimit.maxRequests,
        },
      },
    },
    advanced: {
      ...authCookiePolicy,
    },
    onAPIError: {
      errorURL: `${appBaseUrl}/en/auth/error`,
    },
    database: prismaAdapter(prismaAuthAdapter, {
      provider: 'postgresql', // or "mysql", "postgresql", ...etc
    }),
    emailAndPassword: {
      enabled: !selfHost,
      minPasswordLength: 8,
      maxPasswordLength: 20,
      resetPasswordTokenExpiresIn: 60 * 60,
      async sendResetPassword({ user, url }, request) {
        await sendPasswordResetEmailInternal({
          email: user.email,
          url,
          headers: request?.headers,
        });
      },
      revokeSessionsOnPasswordReset: true,
      // autoSignIn: true, //defaults to true
    },
    session: {
      // Better Auth sessions live for seven days by default. Freshness only
      // protects sensitive account operations; ten seconds made legitimate
      // sessions immediately ineligible for those endpoints and surfaced as
      // seemingly random 401 responses. Keep the library's documented one-day
      // security window explicit here.
      freshAge: 60 * 60 * 24,
      modelName: 't_user_sessions',
    },
    user: {
      modelName: 't_user',
      additionalFields: {
        registrationPlatform: {
          type: 'string',
          required: true,
          returned: false,
          input: false,
          defaultValue: 'UNKNOWN',
        },
        registrationMethod: {
          type: 'string',
          required: true,
          returned: false,
          input: false,
          defaultValue: 'UNKNOWN',
        },
        acquisitionSource: {
          type: 'string',
          required: true,
          returned: false,
          input: false,
          defaultValue: 'UNKNOWN',
        },
      },
      deleteUser: {
        // Account deletion must use DELETE /users/account so object storage,
        // subscription checks, and relational cleanup remain one canonical flow.
        enabled: false,
      },
      changeEmail: {
        enabled: true,
      },
    },
    account: {
      modelName: 't_user_accounts',
      accountLinking: {
        allowDifferentEmails: true,
      },
    },
    verification: {
      modelName: 't_user_verifications',
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const userId = session?.userId;
            if (!userId) return { data: session };
            const user = await findAccountDeletionStateById(
              prismaAuthAdapter,
              userId,
            );
            if (user?.accountDeletionRequestedAt) {
              throw new APIError('FORBIDDEN', {
                code: 'ACCOUNT_DELETION_IN_PROGRESS',
                message: 'ACCOUNT_DELETION_IN_PROGRESS',
              });
            }
            return { data: session };
          },
          after: async (session) => {
            const userId = session?.userId;
            if (!userId) return;

            const loggedInAt = new Date();
            try {
              // 单调更新可避免并发登录的钩子以相反顺序完成时写回较早时间。
              await prismaAuthAdapter.t_user.updateMany({
                where: {
                  id: userId,
                  OR: [
                    { lastLoginAt: null },
                    { lastLoginAt: { lt: loggedInAt } },
                  ],
                },
                data: { lastLoginAt: loggedInAt },
              });
            } catch (error) {
              // 运营统计失败不能阻断用户已经成功完成的登录。
              authLifecycleLogger.error(
                `用户最后登录时间更新失败 userId=${userId}`,
                error instanceof Error ? error.stack : String(error),
              );
            }
          },
        },
      },
      user: {
        create: {
          before: async (user, context) => {
            const signupBlockReason =
              await publicSignupBlockReason(prismaAuthAdapter);
            if (signupBlockReason) {
              throw new APIError('FORBIDDEN', {
                code: signupBlockReason,
                message: signupBlockReason,
              });
            }
            const oauthState = await getOAuthState();
            return {
              data: {
                ...user,
                ...resolveRegistrationAttribution(context, oauthState),
              },
            };
          },
          after: async (user) => {
            const uid = user?.id;
            if (!uid) return;
            try {
              authLifecycleLogger.log(
                `user.create.after 触发，尝试默认静息心率 userId=${uid}`,
              );
              await seedDefaultRestingHeartRateIfAbsent(prismaAuthAdapter, uid);
            } catch (e) {
              authLifecycleLogger.error(
                `新用户默认静息心率写入失败 userId=${uid}`,
                e instanceof Error ? e.stack : String(e),
              );
            }
          },
        },
        update: {
          before: async (user) => {
            if (user.name) {
              if (user.name.length > 20) {
                throw new APIError('BAD_REQUEST', {
                  message: 'Name must be 20 characters or less',
                });
              }
              const validNameRegex = /^[\u4e00-\u9fa5a-zA-Z0-9\s\-_]+$/;
              if (!validNameRegex.test(user.name)) {
                throw new APIError('BAD_REQUEST', {
                  message: 'Name contains invalid characters',
                });
              }
            }
            // better-auth update.before 需要返回 { data }；不返回会把 update payload 变成 undefined。
            return { data: user };
          },
        },
      },
    },
    socialProviders: getDeploymentSocialProviders(
      deploymentAuthContext,
    ) as never,
    plugins: [
      selfHostLocalOwner({
        getOwnerUserId: async () => {
          const instance = await prismaAuthAdapter.selfHostInstance.findUnique({
            where: { id: 1 },
            select: { state: true, ownerUserId: true },
          });
          return instance?.state === 'READY' ? instance.ownerUserId : null;
        },
      }),
      ...getDeploymentAuthPlugins(deploymentAuthContext),
      bearer(),
      jwt({
        jwt: {
          issuer: authIssuer,
          audience: oauthResourceUrls,
        },
        jwks: {
          jwksPath: '/jwks',
        },
      }),
      emailOTP({
        async sendVerificationOTP({ email, otp, type }, request) {
          await sendOtpEmailInternal({
            email,
            otp,
            type,
            headers: request?.headers,
          });
        },

        expiresIn: 60 * 5, // 5 minutes
        allowedAttempts: 3,
      }),
    ],
    trustedOrigins: buildTrustedOrigins(
      process.env.TRUSTED_ORIGINS,
      getDeploymentTrustedOrigins(deploymentAuthContext),
    ),
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const hookCtx = asAuthHookContext(ctx);
        const path = typeof hookCtx.path === 'string' ? hookCtx.path : '';
        if (!isSelfHostMailAuthPathAllowed(path)) {
          throw new APIError('BAD_REQUEST', {
            code: 'SELF_HOST_MAIL_DISABLED',
            message:
              'Email registration and recovery require SMTP; use owner bootstrap or the local owner recovery command',
          });
        }
        await assertEmailLoginAllowed(
          prismaAuthAdapter,
          path,
          hookCtx.body,
          asAuthHeaders(hookCtx.headers),
        );
        await assertEmailAuthAccountNotBeingDeleted(
          prismaAuthAdapter,
          path,
          hookCtx.body,
        );
        assertPasswordPolicyForAuthWrite(path, hookCtx.body);
      }),
      after: createAuthMiddleware(async (ctx) => {
        localizeAuthError(ctx.context.returned, ctx.headers);
      }),
    },
  }) as unknown as AuthInstance;
};

// 导出 auth 实例
export const auth: AuthInstance = getAuthConfig();
