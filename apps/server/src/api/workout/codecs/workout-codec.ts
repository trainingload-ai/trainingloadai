import type { WorkoutSummary } from '../../../../../../packages/shared/workout-summary';
import type {
  WorkoutStructure,
  WorkoutStructureKind,
} from '../../../../../../packages/shared/workout-structure';

export type WorkoutValidationIssue = {
  code: string;
  severity: 'ERROR' | 'WARNING';
  line?: number;
  column?: number;
  endColumn?: number;
  path?: string;
  message: string;
};

export interface WorkoutCodec<TStructure extends WorkoutStructure> {
  readonly kind: WorkoutStructureKind;
  supportsVersion(version: number): boolean;
  parseText(text: string, version: number): TStructure;
  validate(structure: TStructure, version: number): WorkoutValidationIssue[];
  stringify(structure: TStructure, version: number): string;
  summarize(structure: TStructure): WorkoutSummary;
}

export class WorkoutDefinitionValidationError extends Error {
  constructor(public readonly issues: WorkoutValidationIssue[]) {
    super(issues[0]?.message ?? 'Invalid workout definition');
    this.name = 'WorkoutDefinitionValidationError';
  }
}
