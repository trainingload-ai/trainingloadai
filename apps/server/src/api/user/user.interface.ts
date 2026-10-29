import {
  SportType,
  HeartRateZoneModel,
  PaceZoneModel,
  PowerZoneModel,
  Gender,
} from '@prisma/client';
export interface UserProfileResponse {
  // type 运动类型，如果没有则为空
  type?: 'RUN' | 'CYCLING' | 'SWIM';
  // 用户偏好的运动类型
  preferredSports?: ('RUN' | 'CYCLING' | 'SWIM' | 'STRENGTH')[];
  // 体重
  weight?: number;
  // 身高
  height?: number;
  // 年龄
  age?: number;
  // 性别
  gender?: Gender;
  // 生日
  birthDate?: string;
  // 最大心率
  maxHeartRate?: number;
  // 静息心率
  restingHeartRate?: number;
  //  乳酸心率
  lthr?: number;
  ftp?: number;
  // 临界功率
  cp?: number;
  // wPrime
  wPrime?: number;
  Pmax?: number;
  // 临界速度
  cs?: number;

  dPrime?: number;
  // 阈值速度
  tp?: number;
  // 有氧运动阈值pace
  aerobicThresholdPaceSec?: number;
  // 装备重量
  equipmentWeight?: number;
  // 自行车重量
  bikeWeight?: number;
  // 负荷计算优先级（POWER、HEART_RATE、PACE, SESSIONRPE）
  loadSources?: ('POWER' | 'HEART_RATE' | 'PACE' | 'SESSIONRPE')[];
  // 海拔优化模型
  altitudeOptimizationModel?: string;
  // 海拔阈值
  altitudeThreshold?: number;
  // 默认VDOT来源
  defaultVdotSource?: string;
  // VO2Max 校正因子
  vo2maxCorrectionFactor?: number;
  // 心率区间模型
  heartRateZoneModel?: HeartRateZoneModel;
  // 配速区间模型
  paceZoneModel?: PaceZoneModel;

  powerZoneModel?: PowerZoneModel;
  vo2max?: number;

  // 时区
  timezone?: string;
}
export interface UpdateUserProfileRequest {
  username?: string;
  gender?: string;
  weight?: number;
  height?: number;
  age?: number;
  birthDate?: string;
  // 时区
  timezone?: string;
  city?: string;
  country?: string;
  state?: string;
  bio?: string;
  website?: string;
  // 负荷计算优先级（POWER、HEART_RATE、PACE, SESSIONRPE）
  loadSources?: ('POWER' | 'HEART_RATE' | 'PACE' | 'SESSIONRPE')[];
  // 用户偏好的运动类型（RUN、CYCLING、SWIM）
  preferredSports?: ('RUN' | 'CYCLING' | 'SWIM' | 'STRENGTH')[];
  defaultVdotSource?: string;
  vo2maxCorrectionFactor?: number;
  isAutoUpdateVo2max?: boolean;
  // If true, set recordDate to 1970-01-01
  new?: boolean;
  // Sport type for filtering/context
  type?: SportType;
  // Metrics and Thresholds
  maxHeartRate?: number;
  restingHeartRate?: number;
  lthr?: number;
  ftp?: number;
  cp?: number;
  wPrime?: number;
  Pmax?: number;
  cs?: number;
  dPrime?: number;
  aerobicThresholdPaceSec?: number;
  equipmentWeight?: number;
  bikeWeight?: number;
  altitudeOptimizationModel?: string;
  altitudeThreshold?: number;
  heartRateZoneModel?: HeartRateZoneModel;
  paceZoneModel?: PaceZoneModel;
  powerZoneModel?: PowerZoneModel;
  vVo2max?: number;
}
