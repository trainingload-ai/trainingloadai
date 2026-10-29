import type { WorkoutStructure } from '@shared/workout-structure';

export const EXTERNAL_PROGRAM_IMPORT = Symbol('EXTERNAL_PROGRAM_IMPORT');

export type ExternalProgramImportResult = {
  provider: string;
  adapterVersion: string;
  compatibilityStatus: 'LOSSLESS' | 'PARTIAL' | 'OPAQUE';
  sourceText: string;
  sourceHash: string;
  unsupportedFeatures: string[];
  issues: Array<{
    code: string;
    severity: 'WARNING' | 'ERROR';
    line: number;
    message: string;
  }>;
  workouts: Array<{
    externalWorkoutKey: string;
    name: string;
    structure: WorkoutStructure;
  }>;
};

/** Consumer-owned port for optional external static-program importers. */
export interface ExternalProgramImporter {
  supports(provider: string): boolean;
  importProgram(sourceText: string): ExternalProgramImportResult;
}
