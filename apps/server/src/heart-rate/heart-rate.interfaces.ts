import { UserZoneSetting, UserZoneValue } from '@/utils/zones';

/**
 * Heart rate basic statistics
 */
export interface HeartRateBasicStats {
  avg: number; // Average heart rate
  max: number; // Maximum heart rate
  min: number; // Minimum heart rate
  reserve: number; // Heart rate reserve
  intensity: number; // Heart rate intensity percentage
  lthr: number; // Lactate threshold heart rate
}

export interface HeartRateZoneMetrics {
  duration?: number; // Seconds
  percentage?: number; // Percentage
  averageHR?: number; // Average heart rate of the zone
}

/**
 * Heart rate analysis result
 */
export interface HeartRateAnalysisResult {
  basicStats: HeartRateBasicStats;
  chartData?: HeartRateChartData[];
  maxHeartRateEstimates?: MaxHeartRateEstimates;
  efficiencyMetrics?: HeartRateEfficiencyMetrics;
  segmentAnalysis?: HeartRateSegmentAnalysis[];
  trendAnalysis?: HeartRateTrendAnalysis;
}

export interface MaxMeanHeartRate {
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

export interface HeartRateDurationCurveByTimeRange extends MaxMeanHeartRate {
  timeRange: { start?: string; end?: string };
}

export interface HeartRateDurationCurvePoint {
  duration: number;
  bpm: number;
}

export interface HeartRateDurationCurve {
  points: HeartRateDurationCurvePoint[];
}

export interface HeartRateAnalysisMetrics {
  avg?: number; // Average heart rate
  max?: number; // Maximum heart rate
  min?: number; // Minimum heart rate
  HRR?: number; // Heart rate reserve
  zone: UserZoneSetting;
  IntensityFactorHR?: number; // Intensity factor (%)
  hrTss?: number; // Heart rate training stress score
  TRIMP?: number; // Training Impulse
  TRIMP100?: number; // Normalized TRIMP
  TRIMPZonal?: number; // Zonal TRIMP
  paHr?: number; // Pace to Heart Rate (PA-HR)
  pwHr?: number; // Power to Heart Rate (PW-HR)
  maxHrDrop?: number; // Max Heart Rate Drop (Recovery)
  total?: number; // Total heart beats
  age_used?: number; // Age used value
  gender_used?: string; // Gender used value
}

// Heart rate chart data
export interface HeartRateChartData {
  time: string | Date;
  avgHeartRate: number;
  maxHeartRate: number;
  minHeartRate: number;
  heartRateRange: number;
  heartRateBase: number;
  // Dynamic fields: zone_Z1, zone_Z2, zone_Z3, zone_Z4, zone_Z5, zone_EF
  [key: string]: string | number | Date | null | undefined;
}

/**
 * Max heart rate estimation results
 */
export interface MaxHeartRateEstimates {
  config?: number;
  classic?: number; // 220 - age
  improved?: number; // 208 - (0.7 × age)
  femaleSpecific?: number; // 226 - age (female only)
  datadriven?: number; // Derived from historical data
}

/**
 * Heart rate efficiency metrics
 */
export interface HeartRateEfficiencyMetrics {
  efficiencyFactor?: number; // Normalized power / average heart rate
  heartRatePowerDecoupling?: number; // HR-power decoupling percentage
  aerobicDecoupling?: number; // Aerobic decoupling
  cardiacDrift?: number; // Cardiac drift
}

/**
 * Segment heart rate analysis
 */
export interface HeartRateSegmentAnalysis {
  segmentType: 'kilometer' | 'mile' | 'time_interval';
  segmentNumber: number;
  segmentIndex?: number;
  startTime?: number;
  endTime?: number;
  startDistance?: number;
  endDistance?: number;
  distance?: number; // Distance (meters)
  duration: number; // Duration (seconds)
  avgHeartRate?: number;
  averageHeartRate?: number;
  maxHeartRate: number;
  minHeartRate: number;
  heartRateZone?: string;
  dominantZone?: string;
  zoneDistribution?: Record<string, number>;
  efficiency?: number; // Efficiency (if power data available)
}

/**
 * Heart rate trend analysis
 */
export interface HeartRateTrendAnalysis {
  overallTrend: 'increasing' | 'decreasing' | 'stable';
  trendSlope: number; // Heart rate change per minute
  cardiacDrift: number; // Cardiac drift percentage
  fatigueIndex: number; // Fatigue index (0-100)
  heartRateStability: number; // Heart rate stability (0-100)
  cumulativeStats: {
    totalHeartBeats: number;
    avgHeartRate: number;
    timeInZones: Record<string, number>; // Cumulative time in each zone
  };
}

/**
 * Heart rate analysis parameters
 */
export interface HeartRateAnalysisParams {
  activityId: string | number;
  includeChartData?: boolean;
  includePowerData?: boolean; // Include power data for efficiency analysis
  includeSegmentAnalysis?: boolean; // Include segment analysis
}

export interface HeartRateAnalysisInnerParams extends HeartRateAnalysisParams {
  // User-configured max heart rate
  userMaxHeartRate?: number;
  // User-configured resting heart rate
  userRestingHeartRate?: number;
  // Lactate threshold heart rate
  userLactateThresholdHeartRate?: number;
  userAge?: number;
  userGender?: 'male' | 'female';
}

/**
 * Heart rate zone configuration
 */
export interface HeartRateZoneConfig {
  maxHeartRate: number;
  restingHeartRate?: number;
  customZones?: Partial<UserZoneValue>[];
}
