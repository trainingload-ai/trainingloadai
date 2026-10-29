import { $Enums } from '@prisma/client';

export interface DurationCurvePoint {
  duration: number;
  power: number;
}

// 功率持续曲线（短键版本，用于计算返回）
export interface DurationCurve {
  points: DurationCurvePoint[];
  cp?: number;
  wPrime?: number;
}

export interface PowerDurationCurve {
  fiveSecond: number;
  thirtySecond: number;
  oneMinute: number;
  threeMinute: number;
  fiveMinute: number;
  twentyMinute: number;
  sixtyMinute: number;
  twoHour: number;
  threeHour: number;
}

export interface MaxMeanPower {
  '1s'?: number;
  '5s'?: number;
  '10s'?: number;
  '20s'?: number;
  '30s'?: number;
  '1m'?: number;
  '3m'?: number;
  '5m'?: number;
  '10m'?: number;
  '20m'?: number;
  '30m'?: number;
  '60m'?: number;
  '2h'?: number;
  '3h'?: number;
  '6h'?: number;
}

export interface PowerDurationCurveByTimeRange extends MaxMeanPower {
  timeRange: { start?: string; end?: string };
}

export interface PowerEfficiencyMetrics {
  IF?: number; // 强度因子 (IF) - NP/平均心率
  TSS?: number; // 训练应力分数 (TSS) - NP/最大心率
  EF?: number; // 效率因子 (EF) - NP/最大心率
  WKG?: number; // 功率体重比 (WKG) - 功率/体重
}

// 间歇训练分析类型定义
export interface IntervalAnalysisMetrics {
  intervals?: {
    count: number; // 间歇数量
    avgPower: number[]; // 各间歇平均功率
    maxPower: number[]; // 各间歇最大功率
    duration: number[]; // 各间歇持续时间 (秒)
  };
  powerDecayRate?: number; // 功率衰减率 (%/min)
  recoveryIndex?: number; // 恢复指数 (0-100)
}

// 踏频功率关系类型定义
export interface CadencePowerMetrics {
  efficiency?: number; // 功率-踏频效率
  range?: {
    min: number; // 最优踏频下限 (rpm)
    max: number; // 最优踏频上限 (rpm)
    average: number; // 平均最优踏频 (rpm)
  };
  distribution?: {
    cadenceBins: number[]; // 踏频区间
    powerBins: number[]; // 功率区间
    distribution: number[][]; // 二维分布矩阵
  };
}

// 地形相关功率类型定义
export interface TerrainPowerMetrics {
  climbingPower?: {
    avgPower: number; // 爬坡平均功率
    maxPower: number; // 爬坡最大功率
    duration: number; // 爬坡总时间 (秒)
    elevation: number; // 爬坡总海拔 (米)
  };
  flatRoadPower?: {
    avgPower: number; // 平路平均功率
    maxPower: number; // 平路最大功率
    duration: number; // 平路总时间 (秒)
  };
  descendingPower?: {
    avgPower: number; // 下坡平均功率
    maxPower: number; // 下坡最大功率
    duration: number; // 下坡总时间 (秒)
  };
  powerGradientRelation?: {
    gradientBins: number[]; // 坡度区间 (%)
    avgPowers: number[]; // 各坡度区间平均功率
    correlation: number; // 功率-坡度相关系数
  };
}

// eFTP计算结果接口
export interface EstimatedFTPResult {
  eftpValue: number; // 估算的FTP值
  method: 'fastfitness_tps' | 'moron_3param' | 'traditional'; // 计算方法
  confidence: number; // 置信度 (0-1)
  dataPoints?: number; // 用于计算的数据点数量
  r2?: number; // 拟合优度 (仅适用于模型拟合方法)
  parameters?: Record<string, number>; // 可选的模型参数，用于记录计算细节
}

export interface PowerDataPoint {
  timestamp: number;
  power: number;
  elapsedTime: number; // 累计时间（毫秒）
}
/**
 * 功率变异性指标接口
 */
export interface PowerVariabilityMetrics {
  VI: number; // 功率变异性 (VI) - NP/平均功率的比值
  MAS?: number; // 平均绝对坡度  [W/s]
  CV: number; // 功率变异系数 (CV) - 标准差/平均功率
  powerQuartiles: {
    q1: number; // 第一四分位数 (25%)
    q2: number; // 第二四分位数 (50%, 中位数)
    q3: number; // 第三四分位数 (75%)
  };
}

/**
 * 间歇训练分析指标接口
 */
export interface IntervalAnalysisMetrics {
  intervals?: {
    count: number; // 间歇数量
    avgPower: number[]; // 各间歇平均功率
    maxPower: number[]; // 各间歇最大功率
    duration: number[]; // 各间歇持续时间 (秒)
  };
  powerDecayRate?: number; // 功率衰减率 (%/min)
  recoveryIndex?: number; // 恢复指数 (0-100)
}

export interface PowerBasicResponse {
  avg?: number; // 平均功率
  max?: number; // 最大功率
  min?: number; // 最小功率
  WKG?: number; //  功率体重比
  aePower?: number;
  re?: number;
  ei?: number;
  // model?: 'COGGAN' | 'SKIBA';
  ftp?: number;
  eftp?: number;
  cp?: number;
  ecp?: number;
  coggan?: {
    NP?: number;
    TSS?: number;
    IF?: number;
    VI?: number;
    EF?: number;
    TSSHOUR: number;
  };
  skiba?: {
    xPower?: number;
    ETSS?: number;
    RI?: number;
    VI?: number;
    ATISS?: number;
    ANTISS?: number;
  };
}
