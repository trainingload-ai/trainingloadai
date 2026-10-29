import { Injectable, Logger } from '@nestjs/common';
import dayjs = require('dayjs');
import type { Gender, SportType } from '@prisma/client';
import { vVo2MaxFromVDOT } from '@/algorithm/vo2max';

type AnalyzeUserProfile = {
  weight?: number;
  height?: number;
  age?: number;
  gender?: Gender;
  lthr?: number;
  maxHeartRate?: number;
  restingHeartRate?: number;
  ftp?: number;
  cp?: number;
  cs?: number;
  tp?: number;
  vo2max?: number;
  vo2maxCorrectionFactor?: number;
};

type AnalyzeContext = {
  userWeight?: number;
  userHeight?: number;
  age?: number;
  gender?: Gender;
  LTHR?: number;
  MHR?: number;
  RHR?: number;
  FTP?: number;
  CP?: number;
  CS?: number;
  TP?: number;
  vVO2maxMps?: number;
  poolLength?: number;
  rpe?: number;
  vo2maxCorrectionFactor?: number;
};

@Injectable()
export class AnalyzeContextBuilderService {
  private readonly logger = new Logger(AnalyzeContextBuilderService.name);

  /**
   * 构建分析上下文（analysis context）。
   *
   * 这个 context 是“算法/分析层”的统一输入形态，用于：
   * - 功率/配速/心率分析的 zone 填充、归一化、以及派生指标计算
   * - 避免各 analyzer 各自去拼 userProfile 字段造成分叉与不一致
   *
   * 注意：
   * - 这里不做数据库查询；只对已有 userProfile 做字段映射与轻量推导。
   * - VO2Max 的 vVO2maxMps 是从 VDOT 推导出来的速度（m/s），用于跑步相关算法。
   */
  build(args: {
    userId: string;
    sportType: SportType;
    userProfile: AnalyzeUserProfile;
    activityDate?: Date;
  }) {
    const { userId, sportType, userProfile } = args;
    const activityDate = args.activityDate ?? new Date();
    this.logger.debug(
      `[分析上下文] 构建上下文，用户ID=${userId}, 运动类型=${sportType}, date=${dayjs(activityDate).format('YYYY-MM-DD')}`,
    );

    const context: AnalyzeContext = {
      userWeight: userProfile?.weight,
      userHeight: userProfile?.height,
      age: userProfile?.age,
      gender: userProfile?.gender,
      LTHR: userProfile?.lthr ?? undefined,
      MHR: userProfile?.maxHeartRate ?? undefined,
      RHR: userProfile?.restingHeartRate ?? undefined,
      FTP: undefined,
      CP: undefined,
      CS: undefined,
      TP: undefined,
      vVO2maxMps: undefined,
      poolLength: undefined,
      rpe: undefined,
      vo2maxCorrectionFactor: userProfile?.vo2maxCorrectionFactor ?? 1.0,
    };

    if (sportType === 'RUN' || sportType === 'CYCLING') {
      context.FTP = userProfile?.ftp ?? undefined;
      context.CP = userProfile?.cp ?? undefined;

      if (sportType === 'RUN') {
        context.CS = userProfile?.cs ?? undefined;
        context.TP = userProfile?.tp ?? undefined;
        context.vVO2maxMps = userProfile?.vo2max
          ? vVo2MaxFromVDOT(userProfile?.vo2max) / 60
          : undefined;
      }
    }

    return context;
  }
}
