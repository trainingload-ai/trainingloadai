import { Injectable } from '@nestjs/common';
import type { WorkoutSummary } from '../../../../../packages/shared/workout-summary';
import type {
  WorkoutDefinitionInput,
  WorkoutStructure,
  WorkoutStructureKind,
} from '../../../../../packages/shared/workout-structure';
import { WorkoutCodecRegistry } from './workout-codec.registry';
import {
  WorkoutDefinitionValidationError,
  type WorkoutValidationIssue,
} from './codecs/workout-codec';

export type ResolvedWorkoutDefinition = {
  kind: WorkoutStructureKind;
  version: number;
  text: string;
  structure: WorkoutStructure;
  summary: WorkoutSummary;
  warnings: WorkoutValidationIssue[];
};

@Injectable()
export class WorkoutDefinitionService {
  constructor(private readonly registry: WorkoutCodecRegistry) {}

  resolve(
    input: WorkoutDefinitionInput,
    options: { tolerateStoredInvalid?: boolean } = {},
  ): ResolvedWorkoutDefinition {
    const version = Number(input.version ?? 1);
    const codec = this.registry.get(input.kind, version);
    const structure =
      input.source === 'TEXT'
        ? codec.parseText(input.text, version)
        : input.structure;

    if (structure.kind !== input.kind || structure.version !== version) {
      throw new WorkoutDefinitionValidationError([
        {
          code: 'STRUCTURE_KIND_MISMATCH',
          severity: 'ERROR',
          path: 'structure.kind',
          message: `Expected ${input.kind} v${version} structure`,
        },
      ]);
    }

    const issues = codec.validate(structure, version);
    const errors = issues.filter((item) => item.severity === 'ERROR');
    if (errors.length && !options.tolerateStoredInvalid) {
      throw new WorkoutDefinitionValidationError(errors);
    }
    return {
      kind: input.kind,
      version,
      text: codec.stringify(structure, version),
      structure,
      summary: codec.summarize(structure),
      warnings: options.tolerateStoredInvalid
        ? issues
        : issues.filter((item) => item.severity === 'WARNING'),
    };
  }
}
