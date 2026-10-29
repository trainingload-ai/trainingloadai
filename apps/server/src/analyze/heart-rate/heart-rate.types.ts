/**
 * 心率分区统计条目（对应 ActivityZone.HEART_RATE 的落库结构）。
 */
export interface HeartRateZoneEntry {
  /** 分区名称（例如 Z1/Z2...） */
  name: string;
  /** 分区顺序（从 1 开始） */
  order?: number;
  /** 展示色（可选） */
  color?: string;
  /** 在该分区停留时长（秒） */
  duration?: number;
  /** 占比（0-1 或 0-100，取决于上游实现；仅作为透传落库） */
  percent?: number;
  /** 分区下界（bpm） */
  min?: number;
  /** 分区上界（bpm） */
  max?: number;
  /** 分区平均心率（bpm） */
  avg?: number;
}

/**
 * 心率分析结果（metrics 管线与持久化层的稳定输出契约）。
 *
 * 说明：
 * - 该类型主要为“落库/编排层”服务，因此字段以 persistence 需要的为主，
 *   其余分析中间值可以逐步补齐。
 */
export interface HeartRateAnalysisResult {
  /** 平均心率（bpm） */
  avg: number;
  /** 最大心率（bpm） */
  max: number;
  /** 最小心率（bpm） */
  min: number;

  /** TRIMP（训练冲量） */
  TRIMP?: number;
  /** TRIMP100（归一化 TRIMP） */
  TRIMP100?: number;
  /** 分区 TRIMP 点数（ActivityTrimp.trimpZonalPoints，当前实现存 number） */
  TRIMPZonal?: number;

  /** Heart Rate Reserve（MHR-RHR） */
  HRR?: number;
  /** 心率强度因子（avg/LTHR） */
  IntensityFactorHR?: number;
  /** HR TSS */
  hrTss?: number;
  /** 速度-心率解耦（Pace/HR decoupling） */
  paHr?: number;
  /** 功率-心率解耦（Power/HR decoupling） */
  pwHr?: number;
  /** 最大心率下降（用于疲劳/耐力衰减判断） */
  maxHrDrop?: number;

  /** debug：最终使用的年龄/性别（用于排查阈值来源） */
  age_used?: number;
  gender_used?: unknown;

  /** 分区统计（落库到 ActivityZone.HEART_RATE） */
  zone?: {
    benchmark?: unknown;
    zones?: HeartRateZoneEntry[];
  };
}
