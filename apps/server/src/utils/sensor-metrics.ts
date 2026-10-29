import { getPreciseDistance } from 'geolib';

export interface SensorPointInput {
  lat?: number;
  lon?: number;
  ele?: number;
  time?: Date;
  heartRate?: number | null;
  power?: number | null;
  cadence?: number | null;
  speed?: number | null;
}

export interface SensorDerivedState {
  distance?: number; // cumulative meters
  climb?: number | null; // positive elevation delta at this point
  descend?: number | null; // positive descent at this point
  grade?: number | null; // grade (rise/run), unitless (e.g., 0.05 == 5%)
}

export interface MetricCalculator {
  reset(): void;
  compute(
    current: SensorPointInput,
    previous: SensorPointInput | null,
    state: SensorDerivedState,
  ): void;
}

export class CumulativeDistanceCalculator implements MetricCalculator {
  private cumulativeDistance = 0;

  reset(): void {
    this.cumulativeDistance = 0;
  }

  compute(
    current: SensorPointInput,
    previous: SensorPointInput | null,
    state: SensorDerivedState,
  ): void {
    let delta = 0;
    if (
      previous &&
      current.lat !== undefined &&
      current.lon !== undefined &&
      previous.lat !== undefined &&
      previous.lon !== undefined
    ) {
      delta = getPreciseDistance(
        { latitude: previous.lat!, longitude: previous.lon! },
        { latitude: current.lat!, longitude: current.lon! },
      );
      if (!Number.isFinite(delta) || delta < 0) delta = 0;
    }
    this.cumulativeDistance += delta;
    state.distance = this.cumulativeDistance;
  }
}

export class ClimbDescendCalculator implements MetricCalculator {
  private previousElevation: number | null = null;

  reset(): void {
    this.previousElevation = null;
  }

  compute(
    current: SensorPointInput,
    _previous: SensorPointInput | null,
    state: SensorDerivedState,
  ): void {
    const ele = current.ele;
    let climb: number | null = null;
    let descend: number | null = null;
    if (typeof ele === 'number') {
      if (typeof this.previousElevation === 'number') {
        const diff = ele - this.previousElevation;
        if (diff > 0) {
          climb = diff;
          descend = 0;
        } else if (diff < 0) {
          climb = 0;
          descend = -diff;
        } else {
          climb = 0;
          descend = 0;
        }
      } else {
        climb = 0;
        descend = 0;
      }
      this.previousElevation = ele;
    }
    state.climb = climb;
    state.descend = descend;
  }
}
