import { getAuthConfig, sendOtpEmailInternal } from '../../auth';
import {
  Controller,
  Delete,
  Get,
  Request,
  Post,
  Body,
  Put,
  Param,
  Query,
  Logger,
  Headers,
  HttpCode,
  HttpStatus,
  ConflictException,
  Inject,
} from '@nestjs/common';
import {
  AuthService,
  Optional,
  AllowAnonymous,
} from '@thallesp/nestjs-better-auth';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request as ExpressRequest } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { UserQueryService } from './user-query.service';
import {
  $Enums,
  SportType,
  ZoneType,
  UserFitnessMetricType,
  BodyMetricType,
  MetricSource,
} from '@prisma/client';
import { UserService } from './user.service';
import { ZoneModelPreviewQueryDto } from './zone-model-preview.dto';
import { I18n, I18nContext, I18nService } from 'nestjs-i18n';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import {
  UserProfileResponse,
  UpdateUserProfileRequest,
} from './user.interface';
import { AccountDeletionService } from './account-deletion.service';

import { SUPPORTED_APP_LOCALES } from '@/utils/locale.util';
import {
  EXTERNAL_ACCOUNT_DISCONNECT,
  type ExternalAccountDisconnect,
} from './account-provider-lifecycle.port';
import { readVerificationOtpResult } from './verification-otp-response';
import { UserTimezoneInitializerService } from '@/timezone/user-timezone-initializer.service';
import { AuthRateLimitService } from '@/auth/auth-rate-limit.service';
import { RegistrationOtpService } from '@/auth/registration-otp.service';
import { OAuthAuthorizationsService } from './oauth-authorizations.service';
import {
  ONBOARDING_COMPLETION,
  type OnboardingCompletion,
} from '@/onboarding/onboarding-completion.port';
import {
  assertOnboardingCompletion,
  CompleteOnboardingDto,
} from './onboarding-status.dto';
import { AllowPublicDemo } from '@/public-demo/allow-public-demo.decorator';
import { PUBLIC_DEMO_CAPABILITIES } from '@shared/public-demo-policy';
import { RequiresRuntimeCapability } from '@/runtime-capabilities/requires-runtime-capability.decorator';
import {
  PASSWORD_POLICY_MESSAGE,
  passwordMeetsPolicy,
} from '@/auth/password-policy';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import { getDeploymentAccountProviderPolicy } from '@/auth/deployment-auth-plugins';
import {
  isPublicUserSettingCategory,
  publicUserSettingCategories,
} from './public-user-setting-policy';

const RUN_CYCLING_PACE_PREDICTION_DISTANCES = [
  { key: '400m', distanceM: 400 },
  { key: '800m', distanceM: 800 },
  { key: '1500m', distanceM: 1500 },
  { key: '1mi', distanceM: 1609 },
  { key: '3k', distanceM: 3000 },
  { key: '5k', distanceM: 5000 },
  { key: '10k', distanceM: 10000 },
  { key: '20k', distanceM: 20000 },
  { key: '42.2k', distanceM: 42200 },
] as const;

const SWIM_PACE_PREDICTION_DISTANCES = [
  { key: '50m', distanceM: 50 },
  { key: '100m', distanceM: 100 },
  { key: '200m', distanceM: 200 },
  { key: '400m_swim', distanceM: 400 },
  { key: '800m_swim', distanceM: 800 },
  { key: '1500m_swim', distanceM: 1500 },
] as const;

function toPositiveNumber(v: unknown): number | null {
  if (typeof v !== 'number') return null;
  if (!Number.isFinite(v) || v <= 0) return null;
  return v;
}

type LoginAccountRow = {
  id?: string;
  providerId?: string;
  provider?: string;
  createdAt?: Date | string;
};

function normalizeAccountProviderId(account: LoginAccountRow) {
  return String(account?.providerId ?? account?.provider ?? '')
    .trim()
    .toLowerCase();
}

function accountCreatedAtMs(account: LoginAccountRow) {
  const ms = new Date(account?.createdAt).getTime();
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

function originalLoginProviderFromAccounts(accounts: LoginAccountRow[]) {
  const { loginProviderIds } = getDeploymentAccountProviderPolicy();
  return accounts
    .filter((account) =>
      loginProviderIds.has(normalizeAccountProviderId(account)),
    )
    .sort((a, b) => accountCreatedAtMs(a) - accountCreatedAtMs(b))
    .map(normalizeAccountProviderId)[0];
}

/**
 * 用户相关接口（需要登录为主，部分接口对外公开）
 *
 * 模块职责：
 * - 用户区间设置（心率/配速/功率 zones）
 * - 用户画像（profile）与身体指标（body metrics）
 * - 训练指标（fitness metrics：FTP/CP/CS/VO2max 等）的查询与更新
 * - 第三方账号绑定/解绑（accounts）
 * - OTP 注册/重置密码/邮箱验证等账号体系能力（公开接口）
 *
 * 认证说明：
 * - 默认依赖全局 `OAuthHybridAuthGuard`（需要登录态）
 * - 标注 `@AllowAnonymous()` 的接口可匿名访问（通常是 OTP/注册/校验类）
 */
@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private authService: AuthService<ReturnType<typeof getAuthConfig>>,
    private prisma: PrismaService,
    private userService: UserService,
    private i18n: I18nService,
    @Inject(ONBOARDING_COMPLETION)
    private readonly onboardingCompletion: OnboardingCompletion,
    private readonly accountDeletion: AccountDeletionService,
    @Inject(EXTERNAL_ACCOUNT_DISCONNECT)
    private readonly externalAccountDisconnect: ExternalAccountDisconnect,
    private readonly timezoneInitializer: UserTimezoneInitializerService,
    private readonly authRateLimit: AuthRateLimitService,
    private readonly registrationOtp: RegistrationOtpService,
    private readonly oauthAuthorizations: OAuthAuthorizationsService,
    private readonly users: UserQueryService,
    private readonly capabilities?: RuntimeCapabilityService,
  ) {}

  @Get('account-deletion/preview')
  async previewAccountDeletion(@CurrentUserId() userId: string) {
    return this.accountDeletion.preview(userId);
  }

  @Post('account-deletion')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestAccountDeletion(
    @CurrentUserId() userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body()
    confirmation: {
      confirmPermanentDeletion?: boolean;
      acknowledgeAsyncDeletion?: boolean;
      acknowledgeExternalObligations?: boolean;
    },
  ) {
    return this.accountDeletion.requestDeletion({
      userId,
      idempotencyKey: idempotencyKey ?? '',
      confirmation: {
        confirmPermanentDeletion:
          confirmation.confirmPermanentDeletion === true,
        acknowledgeAsyncDeletion:
          confirmation.acknowledgeAsyncDeletion === true,
        acknowledgeExternalObligations:
          confirmation.acknowledgeExternalObligations === true,
      },
    });
  }

  /**
   * 兼容旧客户端。新客户端应使用 POST /users/account-deletion，并显式提交三项确认。
   */
  @Delete('account')
  @HttpCode(HttpStatus.ACCEPTED)
  async deleteAccount(
    @CurrentUserId() userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.accountDeletion.deleteAccount(
      userId,
      idempotencyKey ?? `legacy:${userId}`,
    );
  }

  @Get('zones/preview')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PROFILE_READ)
  getZoneModelPreviews(
    @CurrentUserId() userId: string,
    @Query() query: ZoneModelPreviewQueryDto,
  ) {
    return this.userService.getZoneModelPreviews(
      userId,
      query.sportType,
      query.zoneType,
    );
  }

  /**
   * 获取用户区间配置列表
   *
   * 用途：
   * - 读取用户已配置的 zones（心率/配速/功率），用于前端展示与计算
   *
   * 入参：
   * - sportType: 运动类型（RUN/CYCLING/SWIM，可选）
   * - zoneType: 区间类型（HEART_RATE/PACE/POWER，可选）
   *
   * 返回：
   * - 用户的区间配置集合（由 UserService.getAllUserZones 定义）
   */
  @Get('zones')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PROFILE_READ)
  //@CatchAndTranslate()
  //@Log({ context: 'getAllZones' })
  async getAllZones(
    @CurrentUserId() userId: string,
    @Query('sportType') sportType?: SportType,
    @Query('zoneType') zoneType?: ZoneType,
  ) {
    return await this.userService.getAllUserZones(userId, sportType, zoneType);
  }

  /**
   * 新增或更新用户区间配置（upsert）
   *
   * 用途：
   * - 保存用户自定义 zones（心率/配速/功率）
   *
   * 入参：
   * - sportType: 运动类型（RUN/CYCLING/SWIM）
   * - zoneType: 区间类型（HEART_RATE/PACE/POWER）
   * - zones: 区间数组（结构由前端与 UserService 约定）
   * - benchmark: 区间基准（例如百分比基准）
   */
  @Post('zones')
  //@CatchAndTranslate()
  //@Log({ context: 'upsertZone' })
  async upsertZone(
    @CurrentUserId() userId: string,
    @Body()
    body: {
      sportType: SportType;
      zoneType: ZoneType;
      zones: unknown[];
      benchmark: $Enums.ZoneBase;
    },
  ) {
    if (
      !(
        [SportType.RUN, SportType.CYCLING, SportType.SWIM] as SportType[]
      ).includes(body.sportType)
    ) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.invalid_sport_type'),
      });
    }
    if (
      ![ZoneType.HEART_RATE, ZoneType.PACE, ZoneType.POWER].includes(
        body.zoneType,
      )
    ) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.invalid_zone_type'),
      });
    }
    return await this.userService.upsertZoneSetting(
      userId,
      body.sportType,
      body.zoneType,
      body.zones,
      body.benchmark,
    );
  }

  /**
   * 重置（删除）用户某一类区间配置
   *
   * 用途：
   * - 将指定 sportType + zoneType 的 zones 恢复为“未配置”状态
   */
  @Post('zones/reset')
  //@CatchAndTranslate()
  //@Log({ context: 'resetZone' })
  async resetZone(
    @CurrentUserId() userId: string,
    @Body() body: { sportType: SportType; zoneType: ZoneType },
  ) {
    return await this.userService.deleteZoneSetting(
      userId,
      body.sportType,
      body.zoneType,
    );
  }

  /**
   * 获取用户已绑定的第三方账号列表
   *
   * 用途：
   * - 前端“账号绑定”页面展示当前部署已启用的登录或同步 provider
   *
   * 说明：
   * - 需要登录态
   * - 会结合请求头/会话信息解析 better-auth 的账户数据
   */
  @Get('accounts')
  //@CatchAndTranslate()
  //@Log({ context: 'getAccounts' })
  async getAccounts(
    @CurrentUserId() userId: string,
    @Request() req: ExpressRequest,
  ) {
    // 获取用户的所有第三方账户
    const accounts = await this.authService.api.listUserAccounts({
      headers: fromNodeHeaders(req.headers),
    });

    return {
      accounts: accounts || [],
      userId,
    };
  }

  @Get('oauth-authorizations')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PROFILE_READ)
  async listOAuthAuthorizations(@CurrentUserId() userId: string) {
    return this.oauthAuthorizations.list(userId);
  }

  @Delete('oauth-authorizations/:clientId')
  async revokeOAuthAuthorization(
    @CurrentUserId() userId: string,
    @Param('clientId') clientId: string,
  ) {
    return this.oauthAuthorizations.revoke(userId, clientId);
  }

  @Get('password-status')
  async getPasswordStatus(@CurrentUserId() userId: string) {
    const credentialAccount = await this.prisma.t_user_accounts.findFirst({
      where: {
        userId,
        providerId: 'credential',
        password: { not: null },
      },
      select: { id: true },
    });

    return {
      hasPassword: Boolean(credentialAccount),
    };
  }

  @Post('set-password')
  async setPassword(
    @Request() req: ExpressRequest,
    @Body() body: { newPassword: string },
  ) {
    return await this.authService.api.setPassword({
      body: {
        newPassword: body.newPassword,
      },
      headers: fromNodeHeaders(req.headers),
    });
  }

  @Post('accounts/disconnect/:provider')
  //@CatchAndTranslate()
  //@Log({ context: 'disconnectAccount' })
  async disconnectAccount(
    @CurrentUserId() userId: string,
    @Request() req: ExpressRequest,
    @Param('provider') provider: string,
  ) {
    const normalizedProvider = provider.trim().toLowerCase();
    const accountProviderPolicy = getDeploymentAccountProviderPolicy();
    if (
      accountProviderPolicy.capabilityGuardProviderIds.has(normalizedProvider)
    ) {
      this.capabilities?.require('third-party-sync');
    }

    // 获取用户的所有账户
    const accounts = await this.authService.api.listUserAccounts({
      headers: fromNodeHeaders(req.headers),
    });

    // 找到要断开的账户
    const accountToDisconnect = accounts.find(
      (account) => normalizeAccountProviderId(account) === normalizedProvider,
    );

    if (!accountToDisconnect) {
      return false;
    }

    const originalLoginProvider = originalLoginProviderFromAccounts(accounts);
    if (
      accountProviderPolicy.socialLoginProviderIds.has(normalizedProvider) &&
      originalLoginProvider === normalizedProvider
    ) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t(
          'common.error.cannot_disconnect_primary_login_method',
        ),
      });
    }

    if (accountProviderPolicy.loginProviderIds.has(normalizedProvider)) {
      const hasRemainingLoginMethod = accounts.some(
        (account) =>
          account.id !== accountToDisconnect.id &&
          accountProviderPolicy.loginProviderIds.has(
            normalizeAccountProviderId(account),
          ),
      );
      if (!hasRemainingLoginMethod) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: this.i18n.t(
            'common.error.cannot_disconnect_last_login_method',
          ),
        });
      }
    }

    await this.externalAccountDisconnect.disconnect(
      normalizedProvider,
      userId,
      accountToDisconnect.id,
    );
    return true;
  }

  /**
   * 获取枚举数据（公开接口）
   *
   * 用途：
   * - 前端下拉/配置项需要从服务端拉取 enum 列表（如区间模型、运动类型等）
   *
   * 入参：
   * - category: 枚举分类（EnumCategory）
   *
   * 返回：
   * - enums 列表（按 sortOrder 升序）
   */
  @Get('enums/:category')
  @AllowAnonymous()
  //@CatchAndTranslate()
  //@Log({ context: 'getEnums' })
  async getEnums(@Param('category') category: string) {
    const enums = await this.prisma.enum.findMany({
      where: {
        category: category as $Enums.EnumCategory,
        isActive: true,
      },
      orderBy: {
        sortOrder: 'asc',
      },
    });

    return { enums };
  }

  /**
   * 获取用户画像（profile）
   *
   * 用途：
   * - 汇总用户的身体指标、阈值/区间模型、时区等信息
   * - 可按 sport 传入不同运动类型，获取更贴合该运动的指标（例如 RUN 的 CS/TP/VO2Max）
   *
   * 入参：
   * - sport: RUN/CYCLING/SWIM（可选）
   *
   * 返回：
   * - UserProfileResponse（由 UserService.getComposedUserProfile 计算得到）
   */
  @Get('profile')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PROFILE_READ)
  // 获取用户基本信息
  async getUserProfile(
    @CurrentUserId() userId: string,
    @Query('sport') sport?: 'RUN' | 'CYCLING' | 'SWIM',
  ): Promise<UserProfileResponse> {
    const profile = await this.userService.getComposedUserProfile(
      userId,
      sport,
    );
    return profile;
  }

  /** 是否应提示将档案时区更新为最近活动推断的时区（连续 ≥4 条同 IANA） */
  @Get('me/timezone-prompt')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PROFILE_READ)
  async getTimezonePrompt(@CurrentUserId() userId: string) {
    return await this.userService.getTimezonePrompt(userId);
  }

  /** 仅在账户时区为空时初始化：活动坐标时区优先，其次客户端 IANA 时区。 */
  @Post('me/timezone-initialize')
  async initializeTimezone(
    @CurrentUserId() userId: string,
    @Body() body?: { clientTimezone?: string | null },
  ) {
    return await this.timezoneInitializer.initializeFromAvailableSignals(
      userId,
      body?.clientTimezone,
    );
  }

  /**
   * 获取用户的身体指标（body metrics）
   *
   * 示例：
   * - GET `/users/body-metrics?type=WEIGHT`
   *
   * 入参：
   * - type: 指标类型（例如 WEIGHT/HEIGHT/BIRTHDAY/TIMEZONE 等）
   *
   * 返回：
   * - 指标记录（由 UserService.getUserBodyMetrics 输出）
   */
  @Get('body-metrics')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PROFILE_READ)
  async getUserBodyMetrics(
    @CurrentUserId() userId: string,
    @Query('type') type?: BodyMetricType,
  ) {
    if (!type) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }
    return await this.userService.getUserBodyMetrics(userId, type);
  }

  /**
   * 获取用户“估算”的训练指标（fitness metric）
   *
   * 用途：
   * - 获取系统根据历史活动推断出的估算值（区别于用户手动输入/快照绑定）
   *
   * 入参：
   * - type: 指标类型（FTP/CP/CS/VO2_MAX 等）
   * - sportType: 运动类型（可选；不同运动可能有不同估算）
   *
   * 返回：
   * - 估算指标记录（由 UserService 计算/读取）
   */
  @Get('estimate-fitness-metric')
  async getUserEstimatedFitnessMetric(
    @CurrentUserId() userId: string,
    @Query('type') type?: UserFitnessMetricType,
    @Query('sportType') sportType?: SportType,
  ) {
    if (!type) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }
    if (type !== UserFitnessMetricType.VO2_MAX && !sportType) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }
    const current = await this.userService.getUserFitnessMetric(
      userId,
      type,
      null,
      type === UserFitnessMetricType.VO2_MAX ? SportType.UNKNOWN : sportType,
      MetricSource.ESTIMATED,
    );
    return current?.value;
  }

  /**
   * 聚合获取用户配置类 FitnessMetric。
   * 返回 ESTIMATED / MANUAL / AUTO 三条轨道，以及从 AUTO/MANUAL 中选出的生效值和来源。
   */
  @Get('fitness-metric-pairs')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PROFILE_READ)
  async getUserFitnessMetricPairs(
    @CurrentUserId() userId: string,
    @Query('sportType') sportType?: SportType,
  ) {
    if (!sportType) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }
    return await this.userService.getFitnessMetricPairs({
      userId,
      sportType,
    });
  }

  /**
   * 获取用户实际生效的 FitnessMetric 历史（AUTO + MANUAL）
   * @param session
   * @param type
   * @param sportType
   * @returns
   */
  @Get('fitness-metrics')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PROFILE_READ)
  async getUserFitnessMetrics(
    @CurrentUserId() userId: string,
    @Query('type') type?: UserFitnessMetricType,
    @Query('sportType') sportType?: SportType,
  ) {
    if (!type) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }
    if (type !== UserFitnessMetricType.VO2_MAX && !sportType) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }
    const rows = await this.userService.listEffectiveFitnessMetricsForDialog(
      userId,
      type,
      type === UserFitnessMetricType.VO2_MAX ? SportType.UNKNOWN : sportType,
    );
    return rows;
  }

  @Get('fitness-metrics-auto')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PROFILE_READ)
  async getUserAutoFitnessMetrics(
    @CurrentUserId() userId: string,
    @Query('type') type?: UserFitnessMetricType,
    @Query('sportType') sportType?: SportType,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (!type) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }
    if (type !== UserFitnessMetricType.VO2_MAX && !sportType) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }

    const safeStart = startDate ? new Date(startDate) : undefined;
    const safeEnd = endDate ? new Date(endDate) : undefined;

    const rows = await this.userService.listEstimatedFitnessMetricsForChart(
      userId,
      type,
      type === UserFitnessMetricType.VO2_MAX ? SportType.UNKNOWN : sportType,
      {
        startDate:
          safeStart && Number.isFinite(safeStart.getTime())
            ? safeStart
            : undefined,
        endDate:
          safeEnd && Number.isFinite(safeEnd.getTime()) ? safeEnd : undefined,
      },
    );
    return rows;
  }

  /**
   * 手动修改设置的值
   * @param session
   * @param type
   * @param sportType
   * @param body
   * @returns
   */
  @Put('fitness-metrics')
  async replaceUserFitnessMetrics(
    @CurrentUserId() userId: string,
    @Query('type') type?: UserFitnessMetricType,
    @Query('sportType') sportType?: SportType,
    @Body()
    body?: { metrics: Array<{ effectiveDate: string; value: string }> },
  ) {
    if (!type) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }
    if (type !== UserFitnessMetricType.VO2_MAX && !sportType) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }
    await this.userService.replaceManualFitnessMetricsForDialog({
      userId,
      type,
      sportType:
        type === UserFitnessMetricType.VO2_MAX ? SportType.UNKNOWN : sportType,
      metrics: body?.metrics ?? [],
    });
    return true;
  }

  @Put('body-metrics')
  async replaceUserBodyMetrics(
    @CurrentUserId() userId: string,
    @Query('type') type?: BodyMetricType,
    @Body()
    body?: { metrics: Array<{ effectiveDate: string; value: string }> },
  ) {
    if (!type) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }
    return await this.userService.replaceUserBodyMetrics(
      userId,
      type,
      body?.metrics ?? [],
    );
  }

  @Get('power/cp')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PROFILE_READ)
  async getLatestCriticalPower(
    @CurrentUserId() userId: string,
    @Query('sportType') _sportType?: 'all' | $Enums.SportType,
  ) {
    const profile = await this.userService.getComposedUserProfile(userId);
    return {
      cp: profile.cp,
      ftp: profile.ftp,
    };
  }

  /**
   * 获取用户的 临界功率图，输出格式为 {time, power, status}[]
   * 不区分 status 是否激活，仅仅是返回所有数据制作图表
   * @param sportType
   * @returns
   */
  @Get('cp')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PROFILE_READ)
  async getCriticalPower(
    @CurrentUserId() _userId: string,
    @Query('sportType') _sportType?: SportType,
    @Query('metric') _metric?: 'cp' | 'ftp',
  ) {
    // const isAutoUpdate = await this.userService.checkAutoUpdatePermission(
    //   userId,
    //   metricEnum,
    //   true,
    // );
    // const desiredStatus: 1 | 2 = isAutoUpdate ? 1 : 2;
    // const history = await this.userService.getUserCriticalPowerHistoryDaily(
    //   userId,
    //   sportType,
    //   m,
    //   desiredStatus,
    // );
    // return history.map((h) => ({
    //   time: h.recordedAt,
    //   cp: m === 'cp' ? h.value : null,
    //   ftp: m === 'ftp' ? h.value : null,
    //   status: desiredStatus,
    // }));
  }

  // 获取用户的临界配速
  @Get('pace/cs')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PROFILE_READ)
  async getLatestCriticalSpeed(
    @CurrentUserId() userId: string,
    @Query('sportType') sportType?: SportType,
  ) {
    const resolvedSportType =
      sportType === SportType.RUN ||
      sportType === SportType.CYCLING ||
      sportType === SportType.SWIM
        ? sportType
        : undefined;
    const profile = await this.userService.getComposedUserProfile(
      userId,
      resolvedSportType,
    );
    const csMps =
      toPositiveNumber(profile?.cs) ?? toPositiveNumber(profile?.tp);
    const dPrimeM = toPositiveNumber(profile?.dPrime);
    const distanceSpecs =
      resolvedSportType === SportType.SWIM
        ? SWIM_PACE_PREDICTION_DISTANCES
        : RUN_CYCLING_PACE_PREDICTION_DISTANCES;
    const paceBaseM = resolvedSportType === SportType.SWIM ? 100 : 1000;
    const predictions =
      csMps && csMps > 0
        ? distanceSpecs.map((item) => {
            const timeSec = item.distanceM / csMps;
            return {
              key: item.key,
              distanceM: item.distanceM,
              timeSec,
              paceSec: (timeSec / item.distanceM) * paceBaseM,
            };
          })
        : [];

    return {
      sportType: resolvedSportType ?? SportType.RUN,
      cs: profile.cs,
      csMps,
      dPrimeM,
      r2: null,
      sampleCount: null,
      windowDays: null,
      method: 'PROFILE',
      calculatedAt: null,
      predictions,
    };
  }

  // Auto-update configs
  @Get('auto-update-config')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PROFILE_READ)
  async getAutoUpdateConfigs(@CurrentUserId() userId: string) {
    return await this.userService.listAutoUpdateConfigs(userId);
  }

  @Put('auto-update-config')
  async updateAutoUpdateConfig(
    @CurrentUserId() userId: string,
    @Body()
    body: {
      metric: $Enums.UserFitnessMetricType;
      enabled: boolean;
    },
  ) {
    if (body?.metric === undefined || typeof body?.enabled !== 'boolean') {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }
    const saved = await this.userService.updateAutoUpdateConfig(
      userId,
      body.metric,
      body.enabled,
    );
    return saved;
  }
  // 获取用户设置
  @Get('settings')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PROFILE_READ)
  async getUserSettings(@CurrentUserId() userId: string) {
    const rows = await this.users.settings().findMany({
      where: {
        userId,
        // A bridged Cloud database may retain Managed-only values such as
        // AI_PLAN. Filter in SQL before the Core Prisma client deserializes the
        // enum, whose public schema intentionally excludes those values.
        category: { in: publicUserSettingCategories() },
      },
    });
    const settings: Record<string, string> = {};
    for (const row of rows) {
      if (!isPublicUserSettingCategory(row.category)) continue;
      settings[row.category] = row.value;
    }
    return settings;
  }

  // 更新单个用户设置
  @Put('settings/:category')
  async updateUserSetting(
    @CurrentUserId() userId: string,
    @Param('category') category: string,
    @Body() body: { value: string },
    @I18n() i18n?: I18nContext,
  ) {
    if (!body?.value) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: i18n?.t('common.error.query_condition_error'),
      });
    }
    const candidate = category?.toString()?.toUpperCase();
    if (!isPublicUserSettingCategory(candidate)) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.ACCESS_FORBIDDEN,
        message: 'This setting is not user-configurable',
      });
    }
    const cat = candidate;
    if (cat === $Enums.SettingCategory.AI_DATA_CONSENT) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.ACCESS_FORBIDDEN,
        message:
          'AI data consent must be updated through the dedicated consent flow',
      });
    }
    try {
      await this.users.settings().upsert({
        where: {
          userId_category: {
            userId,
            category: cat,
          },
        },
        update: {
          value: body.value,
        },
        create: {
          userId,
          category: cat,
          value: body.value,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? '');
      if (
        message.includes(
          'invalid input value for enum enum_setting_category',
        ) &&
        message.includes(String(cat))
      ) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: `数据库 enum_setting_category 缺少 ${cat}，请执行 pnpm prisma:deploy 应用迁移`,
        });
      }
      throw error;
    }
    return true;
  }

  /**
   * 更新用户偏好语言（持久化到 DB）
   *
   * 说明：
   * - 用于异步任务（worker/邮件/通知）选择 i18n 语言，避免依赖请求头
   * - 前端切换语言后调用该接口同步即可
   */
  @Put('preferences/locale')
  async updatePreferredLocale(
    @CurrentUserId() userId: string,
    @Body() body: { locale: string },
  ) {
    const locale = String(body?.locale ?? '').trim();
    if (
      !SUPPORTED_APP_LOCALES.includes(
        locale as (typeof SUPPORTED_APP_LOCALES)[number],
      )
    ) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.query_condition_error'),
      });
    }
    await this.users.users().update({
      where: { id: userId },
      data: { preferredLocale: locale },
      select: { id: true },
    });
    return true;
  }

  @Put('profile')
  async updateUserProfile(
    @CurrentUserId() userId: string,
    @Body()
    body: UpdateUserProfileRequest,
  ) {
    if (body.loadSources) {
      const allowed = ['POWER', 'HEART_RATE', 'PACE', 'SESSIONRPE'] as const;
      type LoadSource = (typeof allowed)[number];
      const normalized = body.loadSources.map((s) =>
        String(s).trim().toUpperCase(),
      );
      const invalid = normalized.filter(
        (s) => !(allowed as readonly string[]).includes(s),
      );
      if (invalid.length > 0) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: this.i18n.t('common.error.invalid_load_sources'),
        });
      }
      body.loadSources = normalized as LoadSource[];
    }

    return await this.userService.updateUserProfile(userId, body);
  }

  @Post('profile/calibrate-vo2max')
  async calibrateVo2max(
    @CurrentUserId() userId: string,
    @Body() body: { activityHashId: string },
  ) {
    if (!body.activityHashId) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n?.t('common.error.activity_hash_id_cannot_be_empty'),
      });
    }
    return await this.userService.calibrateVo2maxFromActivity(
      userId,
      body.activityHashId,
    );
  }

  @Post('send-verification-otp')
  @Optional()
  @RequiresRuntimeCapability('mail')
  async sendVerificationOTP(
    @Body()
    body: { email: string; type?: 'email-verification' | 'forget-password' },
    @Request() req: ExpressRequest,
  ) {
    const email = body.email.toLowerCase();

    await this.authRateLimit.assertOtpSendAllowed(req, email);

    // Check if user exists based on type
    const user = await this.users.users().findUnique({
      where: { email },
    });

    if (user?.accountDeletionRequestedAt) {
      throw new ConflictException({
        code: 'ACCOUNT_DELETION_IN_PROGRESS',
        message: 'ACCOUNT_DELETION_IN_PROGRESS',
      });
    }

    if (body.type === 'forget-password' && !user) {
      return true;
    }

    if (
      (body.type === 'email-verification' || !body.type) &&
      user &&
      user.emailVerified
    ) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          this.i18n.t('common.error.user_already_exists') ||
          'User already exists',
      });
    }

    const type = body.type || 'email-verification';
    const locale =
      typeof req.headers['x-lang'] === 'string'
        ? req.headers['x-lang']
        : typeof req.headers['accept-language'] === 'string'
          ? req.headers['accept-language']
          : 'en';

    // 确保 x-lang 头部明确设置，避免中间件读取失败
    // 构造一个 Web Request 以便 better-auth 钩子可以从 request.headers 读到语言
    const webReq = new globalThis.Request(
      'http://localhost/email-otp/send-verification-otp',
      { method: 'POST', headers: fromNodeHeaders(req.headers) },
    );
    // 如果用户不存在，并且类型是 email-verification，则创建验证码
    if (!user && type === 'email-verification') {
      await this.prisma.t_user_verifications.deleteMany({
        where: { identifier: `email-verification-otp-${email}` },
      });
      const otpResult = await this.authService.api.createVerificationOTP({
        body: {
          email,
          type,
        },
        request: webReq,
      });
      const otp = await readVerificationOtpResult(otpResult);
      await sendOtpEmailInternal({
        email,
        otp,
        type,
        lang: locale,
      });
      return true;
    }

    await this.prisma.t_user_verifications.deleteMany({
      where: { identifier: `${type}-otp-${email}` },
    });
    await this.authService.api.sendVerificationOTP({
      body: {
        email,
        type,
      },
      request: webReq,
    });

    return true;
  }

  @Post('register-with-otp')
  @AllowAnonymous()
  @RequiresRuntimeCapability('mail')
  async registerWithOTP(
    @Body()
    body: { email: string; otp: string; password: string; name: string },
    @Request() req: ExpressRequest,
  ) {
    const email = body.email.toLowerCase();

    // 0. Check if user already exists
    const existingUser = await this.users.users().findFirst({
      where: { email },
    });

    if (existingUser) {
      if (existingUser.accountDeletionRequestedAt) {
        throw new ConflictException({
          code: 'ACCOUNT_DELETION_IN_PROGRESS',
          message: 'ACCOUNT_DELETION_IN_PROGRESS',
        });
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          this.i18n.t('common.error.user_already_exists') ||
          'User already exists',
      });
    }

    // Validate password
    if (!passwordMeetsPolicy(body.password)) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: PASSWORD_POLICY_MESSAGE,
      });
    }

    // 1. 以事务锁串行消费 OTP，防止并发错误尝试丢计数或同一 OTP 被重放。
    const otpResult = await this.registrationOtp.consume(email, body.otp);
    if (otpResult !== 'valid') {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message:
          otpResult === 'invalid'
            ? this.i18n.t('common.error.invalid_verification_code')
            : this.i18n.t('common.error.invalid_or_expired_verification_code'),
      });
    }

    // 2. Sign Up
    const res = await this.authService.api.signUpEmail({
      body: {
        email,
        password: body.password,
        name: body.name,
      },
      headers: fromNodeHeaders(req.headers),
    });

    // 3. Mark as verified + 确保默认静息心率（OTP 注册走 signUpEmail，与 better-auth hook 双保险）
    if (res?.user?.id) {
      await this.userService.ensureDefaultRestingHeartRate(res.user.id);
      await this.users.users().update({
        where: { id: res.user.id },
        data: { emailVerified: true },
      });
    }

    return res;
  }

  @Post('verify-email-otp')
  @AllowAnonymous()
  async verifyEmailOTP(
    @Body() body: { email: string; otp: string },
    @Request() req: ExpressRequest,
  ) {
    const user = await this.users.users().findUnique({
      where: { email: body.email },
    });

    if (!user) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.user_not_found'),
      });
    }

    await this.authService.api.verifyEmailOTP({
      body: {
        email: body.email,
        otp: body.otp,
      },
      headers: fromNodeHeaders(req.headers),
    });

    return true;
  }

  @Get('verification-status')
  async getVerificationStatus(@CurrentUserId() userId: string) {
    const user = await this.users.users().findUnique({
      where: { id: userId },
      select: { email: true, emailVerified: true },
    });

    if (!user) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UNAUTHORIZED,
        message: this.i18n.t('common.error.current_user_not_logged_in'),
      });
    }

    return { email: user.email, verified: user.emailVerified };
  }

  @Get('is-new-user')
  @AllowPublicDemo(PUBLIC_DEMO_CAPABILITIES.PROFILE_READ)
  async isNewUser(@CurrentUserId() userId: string) {
    const user = await this.users.users().findUnique({
      where: { id: userId },
      select: { isNewUser: true },
    });

    return user?.isNewUser ?? false;
  }

  @Post('set-new-user-status')
  async setNewUserStatus(
    @CurrentUserId() userId: string,
    @Body() body: CompleteOnboardingDto,
  ) {
    // This endpoint only completes onboarding. Registration is the sole trusted
    // path that may initialize isNewUser=true.
    assertOnboardingCompletion(body.isNewUser);

    const deploymentResult = await this.onboardingCompletion.complete(userId);
    return { isNewUser: false, ...deploymentResult };
  }
}
