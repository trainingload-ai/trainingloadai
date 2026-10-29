import { SportType } from '@prisma/client';
import type { ActivityCoachSportContext } from '../activity-coach-sport-context';

export default interface ComposedProfile {
  weight?: number | null;
  fitnessLevel?: unknown;
  cyclingFtp?: number | null;
  runFtp?: number | null;
  maxHeartRate?: number | null;
  restingHeartRate?: number | null;
  lthr?: number | null;
  heartRateZoneModel?: string | null;
  paceZoneModel?: string | null;
  powerZoneModel?: string | null;
  timezone?: string | null;
}

export interface HeartActivityData {
  activity_basic: {
    start_time?: string;
    duration_sec?: number;
    distance_meters?: number;
    sport_type?: string;
  };
  metrics: {
    avg_hr: number;
    max_hr: number;
    min_hr: number;
    trimp?: number;
    training_effect?: number;
    epoc?: number;
    pa_hr?: number;
    pw_hr?: number;
    vdot?: number;
  };
  zones_mode?: string;
  zones: {
    zone: string;
    duration_sec: number;
    percentage: number;
  }[];
  laps?: {
    lap: number;
    avg_hr: number;
    duration_sec: number;
  }[];
  user_baseline: {
    max_hr_used?: number;
    rest_hr_used?: number;
    lthr_used?: number;
    hrr_used?: number;
  };
}

export interface PowerActivityData {
  activity_basic: {
    start_time?: string;
    duration_sec?: number;
    distance_meters?: number;
    sport_type?: string;
  };
  metrics?: {
    avg_power?: number;
    max_power?: number;
    pw_hr?: number;
  };
  zones?: {
    zone?: 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5' | 'Z6' | 'Z7';
    percentage?: number;
  }[];
  coggan?: {
    normalized_power?: number;
    variability_index?: number;
    intensity_factor?: number;
    tss?: number;
    efficiency_factor?: number;
  };
  skiba?: {
    x_power?: number;
    variability_index?: number;
    relative_intensity?: number;
    bike_score?: number;
    aerobic_tiss?: number;
    anaerobic_tiss?: number;
  };
  laps?: {
    lap?: number;
    avg_power?: number;
    duration_sec?: number;
  }[];
  user_baseline?: {
    ftp_used?: number;
    cp_used?: number;
    w_prime_used?: number;
  };
}

export interface FatigueAnalysisData {
  current_activity?: {
    load?: number;
    tss?: number;
    bike_score?: number;
    trimp?: number;
    duration_sec?: number;
    intensity_factor?: number;
    training_effect?: number;
    epoc?: number;
    recovery_hours?: number;
  };
  historical_load?: {
    acute_7d?: number;
    chronic_28d?: number;
    acute_chronic_ratio?: number;
    daily_load_last_7d?: number[];
    rest_days_last_14d?: number;
  };
  user_profile?: {
    age?: number;
    training_age_years?: number;
    typical_weekly_hours?: number;
  };
}

export interface ExpertFinding {
  dimension: string;
  severity: 'info' | 'warning' | 'critical';
  evidence: string[];
  conclusion: string;
}

export interface ExpertReport {
  expert_id: string;
  confidence: number;
  summary: string;
  findings: ExpertFinding[];
  signals?: string[];
  coach_notes?: string[];
}

export interface HeadCoachInput {
  expert_reports: {
    cardiac?: ExpertReport;
    pacing?: ExpertReport;
    power?: ExpertReport;
    fatigue?: ExpertReport;
  };
}

export type UnifiedActivityZone = {
  name?: string;
  duration_s?: number;
  percent?: number;
  min?: number;
  max?: number;
  avg?: number;
};

export interface UnifiedActivityAnalysisInput {
  sportType: SportType;
  sport_context: ActivityCoachSportContext;
  start_time?: string;
  temporal_context?: {
    /** Calendar date of the activity in the activity/athlete timezone. */
    activity_local_date: string;
    /** IANA timezone used to interpret the activity-local date. */
    activity_timezone: string;
    /** The historical load window ends on this activity-local date. */
    historical_load_as_of: string;
    historical_load_window_days: 14;
  };
  duration_min?: number;
  session_rpe?: number;
  distance_km?: number;
  ascent_m?: number;
  descent_m?: number;
  poolLength_m?: number;
  calories?: number;
  max_hr_drop?: number;
  hr: {
    available?: boolean;
    avg?: number;
    max?: number;
    zone_type?: string;
    primary_zone?: UnifiedActivityZone;
    pwHr?: number;
    paHr?: number;
  };
  power: {
    avg?: number;
    max?: number;
    pw_hr?: number;
    zone_type?: string;
    primary_zone?: UnifiedActivityZone;
    coggan?: {
      np?: number;
      vi?: number;
      if?: number;
      tss?: number;
      ef?: number;
    };
    skiba?: {
      x_power?: number;
      vi?: number;
      ri?: number;
      bike_score?: number;
      aerobic_tiss?: number;
      anaerobic_tiss?: number;
    };
  };
  pace?: {
    average_sec_per_km?: number;
    /** Server-formatted pace. Models must quote this instead of converting seconds. */
    average_formatted?: string;
    average_basis?: 'timer_time_distance' | 'elapsed_time_distance';
    zone_type?: string;
    primary_zone?: UnifiedActivityZone;
  };
  cadence: {
    avg?: number;
    max?: number;
  };
  strength?: {
    exercise_count: number;
    set_count: number;
    completed_set_count: number;
    completed_reps: number;
    timed_set_seconds: number;
    volume_load_kg: number;
    volume_load_lb: number;
    exercises: Array<{
      name: string;
      exercise_code?: string;
      equipment_code?: string;
      sets: Array<{
        set_index: number;
        set_type: string;
        completed: boolean;
        reps?: number;
        duration_seconds?: number;
        load_type: string;
        load_value?: number;
        load_unit?: string;
        rpe?: number;
        rir?: number;
        source: string;
      }>;
    }>;
  };
  estimate: {
    ftp?: number;
    cp?: number;
  };
  activity_fatigue: {
    actual_load?: number | null;
    source?: string | null;
    tss?: number;
    bike_score?: number;
    trimp?: number;
    epoc?: number;
  };
  historical_load?: {
    ATL?: number;
    CTL?: number;
    TSB?: number;
    AC_ratio?: number;
    daily_load_last_7d?: number[];
    rest_days_last_14d?: number;
  };
  user_baseline: {
    max_hr?: number;
    rest_hr?: number;
    lthr?: number;
    hrr?: number;
    ftp?: number;
    cp?: number;
    w_prime?: number;
  };
}

export interface HeartRateAnalysisResponse {
  expert_id: string;
  mode: string;
  confidence: number;
  summary: string;
  zone_compliance: {
    target: string;
    actual: string;
    score: number;
  };
  key_metrics: {
    avg_hr: number;
    drift_pct: number;
    decoupling: number;
    trimp: number;
  };
  findings: {
    dimension: string;
    severity: 'low' | 'medium' | 'high';
    evidence: string[];
    conclusion: string;
  }[];
  risks: {
    signal: string;
    urgency: 'low' | 'medium' | 'high';
    action: string;
  }[];
  tags: string[];
  to_coach: string[];
}
