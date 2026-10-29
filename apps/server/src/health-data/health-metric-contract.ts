/**
 * 与 provider 无关的每日健康指标运行时契约。
 *
 * 所有待投影候选在持久化前都必须经过这里校验，防止 provider adapter 在同一指标
 * 代码下静默混用单位、聚合语义或不可能的数值。
 */
type Contract = {
  /** 允许的来源单位；比较时不区分大小写。 */
  units: string[];
  /** 允许的聚合语义，使用规范大写形式。 */
  aggregations: string[];
  /** 指标定义的数值下界，包含边界。 */
  min?: number;
  /** 指标定义的数值上界，包含边界。 */
  max?: number;
};

const contracts = new Map<string, Contract>();

function register(metricTypes: string[], contract: Contract) {
  metricTypes.forEach((metricType) => contracts.set(metricType, contract));
}

register(['BODY_MASS_KG'], {
  units: ['kg'],
  aggregations: ['LATEST', 'AVG'],
  min: 0,
});
register(
  [
    'RESTING_HEART_RATE_BPM',
    'SLEEP_AVG_HEART_RATE_BPM',
    'HEART_RATE_AVG_BPM',
    'HEART_RATE_SAMPLE_BPM',
  ],
  { units: ['bpm'], aggregations: ['LATEST', 'AVG'], min: 0, max: 300 },
);
register(['HEART_RATE_MIN_BPM'], {
  units: ['bpm'],
  aggregations: ['LATEST', 'MIN'],
  min: 0,
  max: 300,
});
register(['HEART_RATE_MAX_BPM'], {
  units: ['bpm'],
  aggregations: ['LATEST', 'MAX'],
  min: 0,
  max: 300,
});
register(['HRV_SDNN_MS', 'HRV_RMSSD_MS', 'HRV_RMSSD_WEEKLY_AVG_MS'], {
  units: ['ms'],
  aggregations: ['LATEST', 'AVG'],
  min: 0,
  max: 5_000,
});
register(['HRV_RMSSD_5_MIN_HIGH_MS'], {
  units: ['ms'],
  aggregations: ['LATEST', 'MAX'],
  min: 0,
  max: 5_000,
});
register(['VO2_MAX'], {
  units: ['ml/kg/min'],
  aggregations: ['LATEST', 'AVG'],
  min: 0,
  max: 150,
});
register(['STEP_COUNT', 'FLOORS_ASCENDED', 'FLOORS_DESCENDED'], {
  units: ['count'],
  aggregations: ['LATEST', 'SUM'],
  min: 0,
});
register(['DAILY_ACTIVITY_GOAL_PERCENT'], {
  units: ['%', 'percent'],
  aggregations: ['LATEST', 'AVG'],
  min: 0,
});
register(
  [
    'ACTIVE_DURATION_SECONDS',
    'SEDENTARY_DURATION_SECONDS',
    'LIGHT_ACTIVITY_SECONDS',
    'MODERATE_ACTIVITY_SECONDS',
    'VIGOROUS_ACTIVITY_SECONDS',
    'SLEEP_IN_BED_SECONDS',
    'SLEEP_ASLEEP_SECONDS',
    'SLEEP_AWAKE_SECONDS',
    'SLEEP_CORE_SECONDS',
    'SLEEP_DEEP_SECONDS',
    'SLEEP_REM_SECONDS',
    'STRESS_DURATION_SECONDS',
    'REST_STRESS_DURATION_SECONDS',
  ],
  {
    units: ['s'],
    aggregations: ['LATEST', 'SUM', 'DURATION'],
    min: 0,
  },
);
register(['ACTIVE_ENERGY_KCAL', 'TOTAL_ENERGY_KCAL'], {
  units: ['kcal'],
  aggregations: ['LATEST', 'SUM'],
  min: 0,
});
register(['WALKING_RUNNING_DISTANCE_M'], {
  units: ['m'],
  aggregations: ['LATEST', 'SUM'],
  min: 0,
});
register(['SLEEP_SCORE'], {
  units: ['score'],
  aggregations: ['LATEST', 'SCORE', 'AVG'],
  min: 0,
  max: 100,
});
register(['STRESS_LEVEL_AVG'], {
  units: ['score'],
  aggregations: ['LATEST', 'AVG'],
  min: 0,
  max: 100,
});
register(['STRESS_LEVEL_MAX'], {
  units: ['score'],
  aggregations: ['LATEST', 'MAX'],
  min: 0,
  max: 100,
});
register(['RESPIRATION_RATE_AVG_BPM'], {
  units: ['breaths/min'],
  aggregations: ['LATEST', 'AVG'],
  min: 0,
  max: 100,
});
register(['RESPIRATION_RATE_MIN_BPM'], {
  units: ['breaths/min'],
  aggregations: ['LATEST', 'MIN'],
  min: 0,
  max: 100,
});
register(['RESPIRATION_RATE_MAX_BPM'], {
  units: ['breaths/min'],
  aggregations: ['LATEST', 'MAX'],
  min: 0,
  max: 100,
});
register(['SPO2_AVG_PERCENT'], {
  units: ['percent', '%'],
  aggregations: ['LATEST', 'AVG'],
  min: 0,
  max: 100,
});
register(['SPO2_MIN_PERCENT'], {
  units: ['percent', '%'],
  aggregations: ['LATEST', 'MIN'],
  min: 0,
  max: 100,
});
register(['BODY_BATTERY_LATEST'], {
  units: ['score'],
  aggregations: ['LATEST'],
  min: 0,
  max: 100,
});
register(['BODY_BATTERY_MIN'], {
  units: ['score'],
  aggregations: ['LATEST', 'MIN'],
  min: 0,
  max: 100,
});
register(['BODY_BATTERY_MAX'], {
  units: ['score'],
  aggregations: ['LATEST', 'MAX'],
  min: 0,
  max: 100,
});
register(['BODY_BATTERY_CHARGED', 'BODY_BATTERY_DRAINED'], {
  units: ['score'],
  aggregations: ['LATEST', 'SUM'],
  min: 0,
});

/** 返回指标代码对应的契约；不支持时返回 `null`。 */
export function healthMetricContract(metricType: string) {
  return contracts.get(metricType) ?? null;
}

/**
 * 校验候选的指标代码、单位、聚合语义、数值范围和时间范围。
 * 成功时返回规范化的大写聚合语义。
 */
export function assertHealthMetricCandidate(args: {
  metricType: string;
  unit: string;
  aggregation?: string | null;
  value: number;
  startTime: Date;
  endTime: Date;
  localDate: Date;
}) {
  const contract = healthMetricContract(args.metricType);
  if (!contract)
    throw new Error(`Unsupported health metric: ${args.metricType}`);
  const unit = args.unit.trim().toLowerCase();
  if (!contract.units.some((candidate) => candidate.toLowerCase() === unit)) {
    throw new Error(
      `Invalid unit for ${args.metricType}: ${args.unit}; expected ${contract.units.join('|')}`,
    );
  }
  const aggregation = String(args.aggregation ?? 'LATEST').toUpperCase();
  if (!contract.aggregations.includes(aggregation)) {
    throw new Error(
      `Invalid aggregation for ${args.metricType}: ${aggregation}; expected ${contract.aggregations.join('|')}`,
    );
  }
  if (!Number.isFinite(args.value)) {
    throw new Error(`Invalid value for ${args.metricType}: not finite`);
  }
  if (contract.min != null && args.value < contract.min) {
    throw new Error(
      `Invalid value for ${args.metricType}: below ${contract.min}`,
    );
  }
  if (contract.max != null && args.value > contract.max) {
    throw new Error(
      `Invalid value for ${args.metricType}: above ${contract.max}`,
    );
  }
  for (const [name, date] of [
    ['startTime', args.startTime],
    ['endTime', args.endTime],
    ['localDate', args.localDate],
  ] as const) {
    if (!Number.isFinite(date.valueOf())) {
      throw new Error(`Invalid ${name} for ${args.metricType}`);
    }
  }
  if (args.endTime < args.startTime) {
    throw new Error(
      `Invalid interval for ${args.metricType}: end before start`,
    );
  }
  return { aggregation };
}
