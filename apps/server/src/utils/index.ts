import { SportType } from '@prisma/client';
import dayjs = require('dayjs');

export * from './locale.util';
export * from './config-number.util';

/**
 * random number
 * @param digits number
 * @returns
 */
export const generateRandomNumber = (digits = 6): string => {
  let result = '';
  for (let i = 0; i < digits; i++) {
    const randomDigit = Math.floor(Math.random() * 10);
    result += randomDigit.toString();
  }
  return result;
};

// random 19 digits number
export const generateRandomDights = () => {
  const timestamp = Math.floor(Date.now()).toString(); // 获取当前时间戳并转换为字符串
  const randomDigit = Array.from({ length: 19 }, () =>
    Math.floor(Math.random() * 10).toString(),
  ).join('');

  return (timestamp + randomDigit).slice(0, 20);
};

/**
 * 将 FIT 文件中的 Semicircles 转换为十进制经纬度
 * @param {number} semicircles - FIT 文件中的位置数据 (latitude 或 longitude)
 * @returns {number} 转换后的十进制格式 (degrees)
 */
export const semicirclesToDegrees = (semicircles: number) => {
  return semicircles * (180 / Math.pow(2, 31));
};

export const mapStravaTypeToActivityType = (stravaType: string): SportType => {
  const typeMap: Record<string, SportType> = {
    Ride: SportType.CYCLING,
    Run: SportType.RUN,
    Swim: SportType.SWIM,
    Walk: SportType.UNKNOWN,
    Hike: SportType.UNKNOWN,
    WeightTraining: SportType.UNKNOWN,
  };
  return typeMap[stravaType] || SportType.UNKNOWN;
};

export type StravaSportType =
  | 'ALPINESKI'
  | 'BACKCOUNTRYSKI'
  | 'BADMINTON'
  | 'CANOEING'
  | 'CROSSFIT'
  | 'EBIKERIDE'
  | 'ELLIPTICAL'
  | 'EMOUNTAINBIKERIDE'
  | 'GOLF'
  | 'GRAVELRIDE'
  | 'HANDCYCLE'
  | 'HIGHINTENSITYINTERVALTRAINING'
  | 'HIKE'
  | 'ICESKATE'
  | 'INLINESKATE'
  | 'KAYAKING'
  | 'KITESURF'
  | 'MOUNTAINBIKERIDE'
  | 'NORDICSKI'
  | 'PICKLEBALL'
  | 'PILATES'
  | 'RACQUETBALL'
  | 'RIDE'
  | 'ROCKCLIMBING'
  | 'ROLLERSKI'
  | 'ROWING'
  | 'RUN'
  | 'SAIL'
  | 'SKATEBOARD'
  | 'SNOWBOARD'
  | 'SNOWSHOE'
  | 'SOCCER'
  | 'SQUASH'
  | 'STAIRSTEPPER'
  | 'STANDUPPADDLING'
  | 'SURFING'
  | 'SWIM'
  | 'TABLETENNIS'
  | 'TENNIS'
  | 'TRAILRUN'
  | 'VELOMOBILE'
  | 'VIRTUALRIDE'
  | 'VIRTUALROW'
  | 'VIRTUALRUN'
  | 'WALK'
  | 'WEIGHTTRAINING'
  | 'WHEELCHAIR'
  | 'WINDSURF'
  | 'WORKOUT'
  | 'YOGA';
export const mapStravaSportTypeToSportType = (
  stravaSportType: string,
): SportType => {
  // 仅转换 跑步、骑行、游泳 相关的类型，其他全部 UNKNOWN
  const cyclingTypes = [
    'RIDE',
    'EBIKERIDE',
    'EMOUNTAINBIKERIDE',
    'MOUNTAINBIKERIDE',
    'GRAVELRIDE',
    'VELOMOBILE',
    'HANDCYCLE',
    'VIRTUALRIDE',
  ] as const;

  const runningTypes: StravaSportType[] = ['RUN', 'TRAILRUN', 'VIRTUALRUN'];

  const swimmingTypes: StravaSportType[] = ['SWIM'];

  const normalized = (stravaSportType || '').toUpperCase();

  if ((cyclingTypes as readonly string[]).includes(normalized))
    return SportType.CYCLING;
  if ((runningTypes as readonly string[]).includes(normalized))
    return SportType.RUN;
  if ((swimmingTypes as readonly string[]).includes(normalized))
    return SportType.SWIM;

  return SportType.UNKNOWN;
};

export const toMs = (ts: unknown): number | null => {
  if (ts == null) return null;
  if (typeof ts === 'bigint') return Number(ts);
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return Number.isFinite(ts) ? ts : null;
  if (typeof ts !== 'string') return null;
  const ms = dayjs(ts).valueOf();
  return Number.isFinite(ms) ? ms : null;
};
