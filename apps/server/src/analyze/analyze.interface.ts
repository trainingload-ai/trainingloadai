import { UserZoneValue } from '@/utils/zones';
import { SportType } from '@prisma/client';
import { CogganResult } from '@/algorithm/coggan';
import { BikeScoreResult } from '@/algorithm/BikeScore';

export interface SensorData {
  time: string;
  tMs: number;
  distance: string;
  heartRate?: number;
  power?: number;
  calculatedPower?: number;
  speed?: number;
  enhancedSpeed?: number;
  cadence?: number;
  grade?: number;
  altitude?: number;
  enhancedAltitude?: number;
  gap?: number;
  aePace?: number;
}

export interface AnalyzePowerByRecordsResult {
  // Sport type
  sportType: SportType;
  sampleSec?: number;
  avgPower?: number;
  WKG?: number;
  zones?: UserZoneValue[];
  coggan?: CogganResult;
  bikeScore?: BikeScoreResult;
  efficiencyIndexPower?: number;
  pwHr?: number;
  re?: number;
  ei?: number;
}

export interface AnalyzePaceResult {
  avgSpeed?: number; // m/s
  avgGap?: number; // s/m (Grade Adjusted Pace)
  xPace?: number; // s/m (Normalized Pace)
  xGap?: number; // s/m (Normalized Graded Pace)
  // effectiveDistance?: number; // moved to computeDerivedMetrics
  viPace?: number; // Variability Index (Pace)
  viGap?: number; // Variability Index (GAP)
  avgAerobicEfficiency?: number; // 平均跑步效率
  zones?: UserZoneValue[];
  // Best Pace curve could be added later or separate
}

export interface StreamDataPoint {
  time: number; // seconds
  watts?: number;
  heartrate?: number;
  cadence?: number;
  velocity_smooth?: number; // m/s
  altitude?: number;
  distance?: number; // meters
  lat?: number;
  lng?: number;
  grade_smooth?: number;
  // ... other fields
}

export interface UserSettings {
  ftp?: number; // Functional Threshold Power
  cp?: number; // Critical Power
  wPrime?: number; // Anaerobic Work Capacity (J)

  maxHr?: number;
  lthr?: number; // Lactate Threshold Heart Rate
  restHr?: number;

  zones?: {
    power?: { min: number; max: number }[];
    heartrate?: { min: number; max: number }[];
    pace?: { min: number; max: number }[]; // m/s
  };

  weight?: number; // kg
}

export type AnalysisResult = Record<string, unknown>;
