export type HealthComponentStatus = 'ready' | 'unavailable';

export type LivenessResponse = {
  status: 'OK';
  timestamp: string;
};

export type ReadinessResponse = {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: {
    configuration: HealthComponentStatus;
    database: HealthComponentStatus;
  };
};
