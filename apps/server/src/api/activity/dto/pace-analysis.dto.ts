export class PaceZoneDto {
  min: number;
  max: number;
  name: string;
  value: number; // seconds in zone
  percent: number; // percentage in zone
}

export class PaceCurveDto {
  duration: number; // seconds
  pace: number; // seconds/km
}

export class PaceAnalysisResponseDto {
  avgPace: number; // seconds/km
  avgSpeed: number; // km/h
  avgGap: number; // seconds/km (Grade Adjusted Pace)

  xPace: number; // seconds/km (Normalized Pace)
  xGap: number; // seconds/km (Normalized Graded Pace)

  viPace: number; // Variability Index (Pace)
  viGap: number; // Variability Index (GAP)

  aerobicEfficiency: number; // EF (xGap Speed / AvgHR)
  vo2max: number;

  paceZones: PaceZoneDto[];
  // bestPaces: PaceCurveDto[]; // Best Pace for 1km, 5km, 10km, etc. or time-based
}
