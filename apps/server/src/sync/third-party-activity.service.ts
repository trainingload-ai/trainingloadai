import { Injectable, Logger, HttpException } from '@nestjs/common';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import {
  Prisma,
  ThirdPartyProvider,
  ThirdPartyActivityProcessingStatus,
  SportType,
} from '@prisma/client';
import { createHash } from 'crypto';
import { ActivitySourceLifecycleService } from './activity-source-lifecycle.service';
import { readyActivityWhere } from '@/utils/activity-ready-where';

export interface ThirdPartyActivityData {
  activityId?: number;
  externalId: string;
  provider: ThirdPartyProvider;
  externalUserId?: string;
  activityName?: string;
  activityType?: SportType;
  sportType?: SportType;
  description?: string;
  startTime?: Date;
  endTime?: Date;
  timezone?: string;
  startLatitude?: number;
  startLongitude?: number;
  endLatitude?: number;
  endLongitude?: number;
  distance?: number;
  elapsedTime?: number;
  movingTime?: number;
  ascent?: number;
  descent?: number;
  maxSpeed?: number;
  avgSpeed?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgPower?: number;
  maxPower?: number;
  normalizedPower?: number;
  avgCadence?: number;
  maxCadence?: number;
  rawData?: Prisma.InputJsonValue;
}

@Injectable()
export class ThirdPartyActivityService {
  private readonly logger = new Logger(ThirdPartyActivityService.name);

  constructor(
    private prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly activitySourceLifecycle: ActivitySourceLifecycleService,
  ) {}

  /**
   * 创建第三方活动记录
   */
  async createThirdPartyActivity(userId: string, data: ThirdPartyActivityData) {
    try {
      const dataChecksum = this.generateDataHash(data);

      return await this.prisma.thirdPartyActivity.create({
        data: {
          userId,
          provider: data.provider,
          externalId: data.externalId,
          externalUserId: data.externalUserId,
          activityName: data.activityName,
          activityType: data.activityType,
          sportType: data.sportType,
          description: data.description,
          startTime: data.startTime,
          endTime: data.endTime,
          timezone: data.timezone,
          startLatitude: data.startLatitude,
          startLongitude: data.startLongitude,
          endLatitude: data.endLatitude,
          endLongitude: data.endLongitude,
          distance: data.distance,
          elapsedTime: data.elapsedTime,
          movingTime: data.movingTime,
          ascent: data.ascent,
          descent: data.descent,
          maxSpeed: data.maxSpeed,
          avgSpeed: data.avgSpeed,
          avgHeartRate: data.avgHeartRate,
          maxHeartRate: data.maxHeartRate,
          avgPower: data.avgPower,
          maxPower: data.maxPower,
          normalizedPower: data.normalizedPower,
          avgCadence: data.avgCadence,
          maxCadence: data.maxCadence,
          rawData: data.rawData || {},
          dataChecksum,
          processingStatus: ThirdPartyActivityProcessingStatus.PENDING,
        },
      });
    } catch (error) {
      this.logger.error(
        `[创建第三方活动] 失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  /**
   * 根据外部ID和提供商查找活动
   */
  async findByExternalId(externalId: string, provider: ThirdPartyProvider) {
    try {
      return await this.prisma.thirdPartyActivity.findFirst({
        where: {
          externalId,
          provider,
        },
      });
    } catch (error) {
      this.logger.error(
        `[按外部 ID 查询第三方活动] 失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  /**
   * 获取用户的第三方活动列表
   */
  async findByUserId(
    userId: string,
    provider?: ThirdPartyProvider,
    status?: ThirdPartyActivityProcessingStatus,
  ) {
    try {
      return await this.prisma.thirdPartyActivity.findMany({
        where: {
          userId,
          ...(provider && { provider }),
          ...(status && { processingStatus: status }),
        },
        orderBy: { startTime: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `[按用户查询第三方活动] 失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  /**
   * 更新第三方活动
   */
  async updateThirdPartyActivity(
    id: number,
    data: Partial<ThirdPartyActivityData>,
  ) {
    try {
      const updateData: Prisma.ThirdPartyActivityUpdateInput = {};

      // 只更新提供的字段
      (Object.keys(data) as Array<keyof ThirdPartyActivityData>).forEach(
        (key) => {
          if (key === 'rawData') {
            updateData.rawData = data.rawData ?? {};
          } else if (data[key] !== undefined) {
            (updateData as Record<string, unknown>)[key] = data[key];
          }
        },
      );

      if (Object.keys(updateData).length > 0) {
        updateData.dataChecksum = this.generateDataHash(
          data as ThirdPartyActivityData,
        );
      }

      return await this.prisma.thirdPartyActivity.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      this.logger.error(
        `[更新第三方活动] 失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  // Keep the legacy DB columns encapsulated here so the rest of the import
  // pipeline talks in terms of third-party import processing instead of "sync".
  async markPendingImport(id: number) {
    return this.prisma.thirdPartyActivity.update({
      where: { id },
      data: {
        processingStatus: ThirdPartyActivityProcessingStatus.PENDING,
        lastProcessingAttemptAt: new Date(),
        processingErrorMessage: null,
      },
    });
  }

  async markImportProcessing(id: number) {
    return this.prisma.thirdPartyActivity.update({
      where: { id },
      data: {
        processingStatus: ThirdPartyActivityProcessingStatus.SYNCING,
        lastProcessingAttemptAt: new Date(),
        processingErrorMessage: null,
      },
    });
  }

  async markImportCompleted(id: number) {
    return this.prisma.thirdPartyActivity.update({
      where: { id },
      data: {
        processingStatus: ThirdPartyActivityProcessingStatus.COMPLETED,
        processedAt: new Date(),
        lastProcessingAttemptAt: new Date(),
        processingErrorMessage: null,
      },
    });
  }

  async markImportFailed(id: number, errorMessage: string) {
    return this.prisma.thirdPartyActivity.update({
      where: { id },
      data: {
        processingStatus: ThirdPartyActivityProcessingStatus.FAILED,
        lastProcessingAttemptAt: new Date(),
        processingErrorMessage: errorMessage,
        processingRetryCount: { increment: 1 },
      },
    });
  }

  /**
   * 删除第三方活动
   */
  async deleteThirdPartyActivity(id: number) {
    try {
      return await this.activitySourceLifecycle.deactivateThirdPartyActivity(
        id,
      );
    } catch (error) {
      this.logger.error(
        `[删除第三方活动] 失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  /**
   * 批量导入第三方活动
   */
  async batchImport(userId: string, activities: ThirdPartyActivityData[]) {
    const results = [];

    for (const activity of activities) {
      try {
        // 检查是否已存在
        const existing = await this.findByExternalId(
          activity.externalId,
          activity.provider,
        );

        if (existing) {
          // 更新现有记录
          const updated = await this.updateThirdPartyActivity(
            existing.id,
            activity,
          );
          results.push({ action: 'updated', activity: updated });
        } else {
          // 创建新记录
          const created = await this.createThirdPartyActivity(userId, activity);
          results.push({ action: 'created', activity: created });
        }
      } catch (error) {
        this.logger.error(
          `[批量导入第三方活动] 处理失败，外部ID=${activity.externalId}：${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        results.push({ action: 'error', error: error.message, activity });
      }
    }

    return results;
  }

  /**
   * 根据 Activity HashId 查询第三方活动
   */
  async findByActivityHashId(hashId: string, provider: ThirdPartyProvider) {
    try {
      const activity = await this.prisma.activity.findFirst({
        where: readyActivityWhere({ hashId }),
      });

      if (!activity) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: `未找到活动 ${hashId}`,
        });
      }

      // 4. 获取指定来源的活动 ID
      const mapping = await this.prisma.activityThirdPartyMapping.findFirst({
        where: {
          activityId: activity.id,
          isActive: true,
          thirdPartyActivity: {
            provider: provider,
          },
        },
        include: {
          thirdPartyActivity: true,
        },
      });

      if (!mapping) {
        throw new BusinessException({
          code: BUSINESS_ERROR_CODE.COMMON,
          message: `未找到活动 ${hashId} 的映射`,
        });
      }

      return mapping.thirdPartyActivity;
    } catch (error) {
      this.logger.error(
        `[按活动 HashId 查询第三方活动] 失败：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('error.common.internal_server_error', {
          lang: I18nContext.current()?.lang,
        }),
      });
    }
  }

  /**
   * 生成数据哈希值用于检测变更
   */
  private generateDataHash(data: ThirdPartyActivityData): string {
    const hashData = {
      externalId: data.externalId,
      activityName: data.activityName,
      startTime: data.startTime,
      elapsedTime: data.elapsedTime,
      distance: data.distance,
      ascent: data.ascent,
    };

    return createHash('sha256').update(JSON.stringify(hashData)).digest('hex');
  }
}
