import {
  MetricSource,
  SportType,
  UserFitnessMetricType,
  type PrismaClient,
} from '@prisma/client';
import { Logger } from '@nestjs/common';
import dayjs = require('dayjs');

const logger = new Logger('UserFitnessDefaults');

/** 新用户档案默认静息心率（bpm） */
export const DEFAULT_RESTING_HEART_RATE_BPM = 60;

/** 若用户尚无 MANUAL + UNKNOWN 的静息心率记录，则幂等写入默认值。 */
export async function seedDefaultRestingHeartRateIfAbsent(
  prisma: Pick<PrismaClient, 'userFitnessMetric'>,
  userId: string,
): Promise<void> {
  const existing = await prisma.userFitnessMetric.findFirst({
    where: {
      userId,
      type: UserFitnessMetricType.RESTING_HR,
      source: MetricSource.MANUAL,
      sport: SportType.UNKNOWN,
    },
    select: { id: true },
  });
  if (existing) {
    logger.debug(
      `静息心率已存在，跳过种子 userId=${userId} metricId=${existing.id}`,
    );
    return;
  }

  await prisma.userFitnessMetric.create({
    data: {
      userId,
      type: UserFitnessMetricType.RESTING_HR,
      sport: SportType.UNKNOWN,
      source: MetricSource.MANUAL,
      value: DEFAULT_RESTING_HEART_RATE_BPM,
      recordedAt: dayjs().startOf('day').toDate(),
    },
  });
  logger.log(
    `已写入默认静息心率 ${DEFAULT_RESTING_HEART_RATE_BPM} bpm userId=${userId}`,
  );
}
