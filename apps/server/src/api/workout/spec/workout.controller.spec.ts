import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { WorkoutDefinitionValidationError } from '../codecs/workout-codec';
import { WorkoutController } from '../workout.controller';

type DefinitionInput = {
  kind: string;
  version?: number;
  text?: string;
};

describe('WorkoutController typed definition endpoints', () => {
  it('parses a local batch in request order', () => {
    const resolve = jest.fn((input: DefinitionInput) => ({
      kind: input.kind,
      version: input.version,
      text: input.text,
      structure: { kind: input.kind, version: input.version },
      summary: { kind: input.kind },
      warnings: [],
    }));
    const controller = new WorkoutController(
      {} as never,
      { resolve } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = controller.parseDefinitions({
      definitions: [
        { kind: 'ENDURANCE', version: 1, source: 'TEXT', text: 'work 30m' },
        {
          kind: 'STRENGTH',
          version: 1,
          source: 'TEXT',
          text: 'exercise "Squat" { work 3x5 open }',
        },
      ],
    });

    expect(result.definitions.map((item) => item.kind)).toEqual([
      'ENDURANCE',
      'STRENGTH',
    ]);
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('prefixes batch validation issue paths with their item index', () => {
    const controller = new WorkoutController(
      {} as never,
      {
        resolve: jest.fn((input: DefinitionInput) => {
          if (input.kind === 'STRENGTH') {
            throw new WorkoutDefinitionValidationError([
              {
                code: 'MISSING_WORK_SET',
                severity: 'ERROR',
                path: 'exercises[0]',
                message: 'Missing work set',
              },
            ]);
          }
          return { kind: input.kind };
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    let thrown: unknown;
    try {
      controller.parseDefinitions({
        definitions: [
          { kind: 'ENDURANCE', version: 1, source: 'TEXT', text: 'work 30m' },
          { kind: 'STRENGTH', version: 1, source: 'TEXT', text: 'invalid' },
        ],
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnprocessableEntityException);
    expect(
      (thrown as UnprocessableEntityException).getResponse(),
    ).toMatchObject({
      code: 'WORKOUT_DEFINITIONS_INVALID',
      data: {
        issues: [
          expect.objectContaining({ path: 'definitions[1].exercises[0]' }),
        ],
      },
    });
  });
});
