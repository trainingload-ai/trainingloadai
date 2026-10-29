import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
  Inject,
  UnprocessableEntityException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { BUSINESS_ERROR_CODE } from '@/filters/business-exception/business-exception.error.codes';
import { FileInterceptor } from '@nestjs/platform-express';
import { WorkoutService, type PlanBlock } from './workout.service';
import { ParseTextDto } from './dto/parse-text.dto';
import { ParseWorkoutDefinitionDto } from './dto/parse-workout-definition.dto';
import { ParseWorkoutDefinitionsDto } from './dto/parse-workout-definitions.dto';
import { WorkoutDefinitionService } from './workout-definition.service';
import { WorkoutDefinitionValidationError } from './codecs/workout-codec';
import { ExportWorkoutDto } from './dto/export-workout.dto';
import { WorkoutExternalAdapterRegistry } from './external/workout-external-adapter.registry';
import { ImportExternalWorkoutDto } from './dto/import-external-workout.dto';
import type { WorkoutStructure } from '../../../../../packages/shared/workout-structure';
import {
  EXTERNAL_PROGRAM_IMPORT,
  type ExternalProgramImporter,
} from './external-program-import.port';

type BuildWorkoutBody = {
  text?: string;
  blocks?: PlanBlock[];
  sport?: string;
  subSport?: string;
  name?: string;
  manufacturer?: string;
  product?: number;
};

function asWorkoutStructure(value: unknown): WorkoutStructure {
  return value as WorkoutStructure;
}

@Controller('workout')
export class WorkoutController {
  constructor(
    private readonly workoutService: WorkoutService,
    private readonly workoutDefinitionService: WorkoutDefinitionService,
    private readonly externalAdapters: WorkoutExternalAdapterRegistry,
    @Inject(EXTERNAL_PROGRAM_IMPORT)
    private readonly externalProgramImporter: ExternalProgramImporter,
    private readonly i18n: I18nService,
  ) {}

  @Post('parse')
  @UseInterceptors(FileInterceptor('file'))
  async parse(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.UPLOAD_NO_FILE,
        message: this.i18n.t('common.error.upload_no_file'),
      });
    }
    const ext = file.originalname?.split('.').pop()?.toLowerCase();
    if (!ext || !['fit'].includes(ext)) {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.unsupported_file_type'),
      });
    }
    const parsed = await this.workoutService.parseFile(file.buffer);
    return parsed;
  }

  @Post('import-external')
  importExternalWorkout(@Body() dto: ImportExternalWorkoutDto) {
    if (!this.externalProgramImporter.supports(dto.provider)) {
      throw new UnprocessableEntityException({
        code: 'EXTERNAL_PROGRAM_PROVIDER_UNSUPPORTED',
        message: 'EXTERNAL_PROGRAM_PROVIDER_UNSUPPORTED',
      });
    }
    const imported = this.externalProgramImporter.importProgram(dto.sourceText);
    return {
      ...imported,
      workouts: imported.workouts.map(({ structure, ...workout }) => ({
        ...workout,
        definition: this.workoutDefinitionService.resolve({
          kind: 'STRENGTH',
          version: 1,
          source: 'STRUCTURE',
          structure,
        }),
      })),
    };
  }

  @Post('export')
  async exportWorkout(@Body() dto: ExportWorkoutDto) {
    let definition;
    try {
      definition = this.workoutDefinitionService.resolve({
        kind: dto.definition.kind,
        version: dto.definition.version,
        ...(dto.definition.source === 'TEXT'
          ? { source: 'TEXT' as const, text: dto.definition.text ?? '' }
          : {
              source: 'STRUCTURE' as const,
              structure: asWorkoutStructure(dto.definition.structure),
            }),
      });
    } catch (error) {
      if (error instanceof WorkoutDefinitionValidationError) {
        throw new UnprocessableEntityException({
          code: 'WORKOUT_DEFINITION_INVALID',
          message: error.message,
          data: { issues: error.issues },
        });
      }
      throw error;
    }
    return this.externalAdapters
      .get(dto.provider)
      .export(definition.structure, {
        deviceProfile: dto.deviceProfile,
        name: dto.name,
        sport: dto.sport,
        subSport: dto.subSport,
        manufacturer: dto.manufacturer,
        product: dto.product,
      });
  }

  @Post('parse-text')
  async parseText(@Body() dto: ParseTextDto) {
    if (!dto?.text || dto.text.trim() === '') {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.text_content_empty'),
      });
    }
    return this.workoutService.parsePlanText(dto.text);
  }

  @Post('parse-definition')
  parseDefinition(@Body() dto: ParseWorkoutDefinitionDto) {
    try {
      return {
        definition: this.workoutDefinitionService.resolve({
          kind: dto.kind,
          version: dto.version,
          ...(dto.source === 'TEXT'
            ? { source: 'TEXT' as const, text: dto.text ?? '' }
            : {
                source: 'STRUCTURE' as const,
                structure: asWorkoutStructure(dto.structure),
              }),
        }),
      };
    } catch (error) {
      if (error instanceof WorkoutDefinitionValidationError) {
        throw new UnprocessableEntityException({
          code: 'WORKOUT_DEFINITION_INVALID',
          message: error.message,
          data: { issues: error.issues },
        });
      }
      throw error;
    }
  }

  @Post('parse-definitions')
  parseDefinitions(@Body() dto: ParseWorkoutDefinitionsDto) {
    const definitions = [];
    const issues = [];
    for (const [index, definition] of (dto.definitions ?? []).entries()) {
      try {
        definitions.push(
          this.workoutDefinitionService.resolve({
            kind: definition.kind,
            version: definition.version,
            ...(definition.source === 'TEXT'
              ? { source: 'TEXT' as const, text: definition.text ?? '' }
              : {
                  source: 'STRUCTURE' as const,
                  structure: asWorkoutStructure(definition.structure),
                }),
          }),
        );
      } catch (error) {
        if (!(error instanceof WorkoutDefinitionValidationError)) throw error;
        issues.push(
          ...error.issues.map((issue) => ({
            ...issue,
            path: issue.path
              ? `definitions[${index}].${issue.path}`
              : `definitions[${index}]`,
          })),
        );
      }
    }
    if (issues.length) {
      throw new UnprocessableEntityException({
        code: 'WORKOUT_DEFINITIONS_INVALID',
        message: 'One or more workout definitions are invalid',
        data: { issues },
      });
    }
    return { definitions };
  }

  @Post('build')
  async build(@Body() dto: BuildWorkoutBody) {
    const { text, blocks, sport, subSport, name, manufacturer, product } =
      dto || {};
    let planBlocks;
    if (text && typeof text === 'string' && text.trim() !== '') {
      planBlocks = this.workoutService.parsePlanText(text);
    } else if (Array.isArray(blocks)) {
      planBlocks = blocks;
    } else {
      throw new BusinessException({
        code: BUSINESS_ERROR_CODE.COMMON,
        message: this.i18n.t('common.error.workout_plan_required'),
      });
    }

    const bytes = await this.workoutService.buildFITFromPlan(planBlocks, {
      sport,
      subSport,
      name,
      manufacturer,
      product,
    });
    const base64 = Buffer.from(bytes).toString('base64');
    return {
      filename: `${name || 'workout'}.fit`,
      contentType: 'application/octet-stream',
      base64,
    };
  }
}
