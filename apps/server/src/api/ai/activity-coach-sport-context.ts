import { SportType } from '@prisma/client';

export type ActivityCoachSportFamily = 'RUN' | 'CYCLING' | 'SWIM' | 'OTHER';

export type ActivityCoachMetricDomain =
  | 'duration'
  | 'distance'
  | 'elevation'
  | 'heart_rate'
  | 'power'
  | 'cadence'
  | 'load'
  | 'pace'
  | 'session_rpe'
  | 'strength'
  | 'swim';

export type ActivityCoachSportContext = {
  family: ActivityCoachSportFamily;
  sportCode: string;
  sportLabel: string;
  allowedMetricDomains: ActivityCoachMetricDomain[];
  coachingFocus: string[];
  forbiddenInferences: string[];
};

const ENDURANCE_BASE: ActivityCoachMetricDomain[] = [
  'duration',
  'distance',
  'heart_rate',
  'load',
];

const SPECIALTIES: Record<
  string,
  Pick<
    ActivityCoachSportContext,
    'sportLabel' | 'coachingFocus' | 'forbiddenInferences'
  > & { allowedMetricDomains?: ActivityCoachMetricDomain[] }
> = {
  ROAD_RUNNING: {
    sportLabel: 'Road running',
    coachingFocus: [
      'pacing consistency',
      'aerobic execution',
      'running economy',
    ],
    forbiddenInferences: ['technical trail difficulty'],
  },
  TRAIL_RUNNING: {
    sportLabel: 'Trail running',
    coachingFocus: [
      'effort relative to elevation',
      'climbing and descending load',
      'terrain-aware pacing',
    ],
    forbiddenInferences: ['judge execution from flat-road pace alone'],
  },
  TREADMILL_RUNNING: {
    sportLabel: 'Treadmill running',
    coachingFocus: [
      'effort control',
      'heart-rate response',
      'pace progression',
    ],
    forbiddenInferences: [
      'GPS route quality',
      'outdoor elevation or wind effects',
    ],
  },
  ROAD_CYCLING: {
    sportLabel: 'Road cycling',
    coachingFocus: [
      'power and intensity distribution',
      'cadence',
      'aerobic durability',
    ],
    forbiddenInferences: ['running economy or stride mechanics'],
  },
  MOUNTAIN_BIKING: {
    sportLabel: 'Mountain biking',
    coachingFocus: [
      'variable power demand',
      'climbing load',
      'terrain-driven intensity changes',
    ],
    forbiddenInferences: ['judge execution from road-bike speed alone'],
  },
  GRAVEL_CYCLING: {
    sportLabel: 'Gravel cycling',
    coachingFocus: [
      'variable surface load',
      'power durability',
      'cadence and pacing',
    ],
    forbiddenInferences: ['judge execution from road-bike speed alone'],
  },
  INDOOR_CYCLING: {
    sportLabel: 'Indoor cycling',
    coachingFocus: [
      'power target execution',
      'cadence',
      'cardiovascular drift',
    ],
    forbiddenInferences: ['GPS route, outdoor elevation, or wind effects'],
  },
  POOL_SWIMMING: {
    sportLabel: 'Pool swimming',
    coachingFocus: [
      'pace per length',
      'stroke efficiency',
      'SWOLF and repeat consistency',
    ],
    forbiddenInferences: [
      'cycling power, running stride, or outdoor elevation',
    ],
  },
  OPEN_WATER_SWIMMING: {
    sportLabel: 'Open-water swimming',
    coachingFocus: [
      'sustained effort',
      'pace stability',
      'heart-rate response when available',
    ],
    forbiddenInferences: ['pool-turn efficiency unless pool lengths exist'],
  },
  STRENGTH_TRAINING: {
    sportLabel: 'Strength training',
    allowedMetricDomains: [
      'duration',
      'heart_rate',
      'load',
      'session_rpe',
      'strength',
    ],
    coachingFocus: [
      'exercise completion',
      'sets and repetitions',
      'load and volume',
      'RPE/RIR and recovery',
    ],
    forbiddenInferences: [
      'pace',
      'speed',
      'distance',
      'elevation',
      'cadence',
      'stride mechanics',
      'cycling power zones',
    ],
  },
  WALKING: {
    sportLabel: 'Walking',
    allowedMetricDomains: [...ENDURANCE_BASE, 'elevation', 'cadence'],
    coachingFocus: [
      'duration',
      'aerobic consistency',
      'terrain and recovery value',
    ],
    forbiddenInferences: ['running economy or cycling power zones'],
  },
  HIKING: {
    sportLabel: 'Hiking',
    allowedMetricDomains: [...ENDURANCE_BASE, 'elevation', 'cadence'],
    coachingFocus: ['time on feet', 'elevation load', 'sustainable effort'],
    forbiddenInferences: ['flat-road pace targets'],
  },
  HIIT: {
    sportLabel: 'HIIT',
    allowedMetricDomains: ['duration', 'heart_rate', 'load', 'session_rpe'],
    coachingFocus: ['work intensity', 'session RPE', 'recovery demand'],
    forbiddenInferences: [
      'distance, elevation, stride, or steady-state pacing',
    ],
  },
  YOGA: {
    sportLabel: 'Yoga',
    allowedMetricDomains: ['duration', 'heart_rate', 'load', 'session_rpe'],
    coachingFocus: ['session duration', 'recovery role', 'subjective effort'],
    forbiddenInferences: [
      'pace, distance, elevation, cadence, or power performance',
    ],
  },
  STRETCHING: {
    sportLabel: 'Stretching',
    allowedMetricDomains: ['duration', 'heart_rate', 'load', 'session_rpe'],
    coachingFocus: ['session duration', 'recovery role', 'subjective response'],
    forbiddenInferences: [
      'pace, distance, elevation, cadence, or power performance',
    ],
  },
  ROWING: {
    sportLabel: 'Rowing',
    allowedMetricDomains: [...ENDURANCE_BASE, 'power', 'cadence'],
    coachingFocus: ['stroke rate', 'power consistency', 'aerobic execution'],
    forbiddenInferences: ['running stride or cycling-specific power zones'],
  },
  ELLIPTICAL: {
    sportLabel: 'Elliptical',
    allowedMetricDomains: [...ENDURANCE_BASE, 'power', 'cadence'],
    coachingFocus: ['cardiovascular effort', 'cadence', 'session load'],
    forbiddenInferences: ['GPS pace, elevation, or running stride mechanics'],
  },
};

/**
 * 解析活动教练运动上下文。
 * @param activity - 活动。
 * @returns 活动教练运动上下文。
 */
export function resolveActivityCoachSportContext(activity: {
  sportType?: SportType | string | null;
  sportDefinitionCode?: string | null;
}): ActivityCoachSportContext {
  const family: ActivityCoachSportFamily =
    activity.sportType === SportType.RUN
      ? 'RUN'
      : activity.sportType === SportType.CYCLING
        ? 'CYCLING'
        : activity.sportType === SportType.SWIM
          ? 'SWIM'
          : 'OTHER';
  const sportCode = String(
    activity.sportDefinitionCode ?? activity.sportType ?? 'OTHER',
  )
    .trim()
    .toUpperCase();
  const specialty = SPECIALTIES[sportCode];
  const familyDomains: Record<
    ActivityCoachSportFamily,
    ActivityCoachMetricDomain[]
  > = {
    RUN: [...ENDURANCE_BASE, 'elevation', 'power', 'cadence', 'pace'],
    CYCLING: [...ENDURANCE_BASE, 'elevation', 'power', 'cadence'],
    SWIM: ['duration', 'distance', 'heart_rate', 'cadence', 'load', 'swim'],
    OTHER: ['duration', 'heart_rate', 'load', 'session_rpe'],
  };

  return {
    family,
    sportCode,
    sportLabel:
      specialty?.sportLabel ??
      sportCode
        .toLowerCase()
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' '),
    allowedMetricDomains:
      specialty?.allowedMetricDomains ?? familyDomains[family],
    coachingFocus:
      specialty?.coachingFocus ??
      (family === 'RUN'
        ? ['pacing', 'heart-rate response', 'running execution']
        : family === 'CYCLING'
          ? ['power', 'cadence', 'cycling execution']
          : family === 'SWIM'
            ? ['swim pace', 'stroke efficiency', 'repeat consistency']
            : [
                'duration',
                'available physiological response',
                'recovery value',
              ]),
    forbiddenInferences:
      specialty?.forbiddenInferences ??
      (family === 'OTHER'
        ? [
            'unsupported pace, distance, elevation, cadence, stride, or power claims',
          ]
        : []),
  };
}

export function activityCoachAllows(
  context: ActivityCoachSportContext,
  domain: ActivityCoachMetricDomain,
) {
  return context.allowedMetricDomains.includes(domain);
}
