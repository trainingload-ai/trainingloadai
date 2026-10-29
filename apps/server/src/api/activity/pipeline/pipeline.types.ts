import type { Activity } from '@prisma/client';
import type { ActivityType } from 'trackswap';

/** 大管道：从解析后的活动切片到 Parquet + 触发分析 */
export interface MacroSensorExtractPipelineContext {
  activity: Activity;
  activityFile: ActivityType;
  userId: string;
}

/** 子管道：单活动 analyzeAndPersistCore 内各分析步骤 */
export interface ActivityAnalyzePipelineContext {
  activity: Activity;
  userId?: string;
}
