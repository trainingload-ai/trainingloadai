import type { WorkoutStructure } from '../../../../../../packages/shared/workout-structure';

export type WorkoutExternalProvider = string;
export const WORKOUT_EXTERNAL_ADAPTERS = Symbol('WORKOUT_EXTERNAL_ADAPTERS');
export type WorkoutExportStatus = 'LOSSLESS' | 'DEGRADED' | 'UNSUPPORTED';

export type WorkoutCapabilityWarning = {
  code: string;
  message: string;
  path?: string;
};

export type WorkoutCapabilityAssessment = {
  status: WorkoutExportStatus;
  preservedFields: string[];
  droppedFields: string[];
  warnings: WorkoutCapabilityWarning[];
};

export type WorkoutExportContext = {
  name?: string;
  deviceProfile?: string;
  sport?: string;
  subSport?: string;
  manufacturer?: string;
  product?: number;
};

export type WorkoutExternalExportResult = WorkoutCapabilityAssessment & {
  provider: WorkoutExternalProvider;
  adapterVersion: string;
  file?: {
    filename: string;
    contentType: string;
    base64: string;
  };
};

export interface WorkoutExternalAdapter {
  readonly provider: WorkoutExternalProvider;
  readonly adapterVersion: string;
  assessCapabilities(
    structure: WorkoutStructure,
    context: WorkoutExportContext,
  ): WorkoutCapabilityAssessment;
  export(
    structure: WorkoutStructure,
    context: WorkoutExportContext,
  ): Promise<WorkoutExternalExportResult>;
}
