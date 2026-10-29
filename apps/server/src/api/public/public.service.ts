import { BadRequestException, Injectable } from '@nestjs/common';
import { generateHeartRateZonesFromProfile } from '../../heart-rate/heart-rate.utils';
import { CalculateHeartRateZonesDto } from './dto/calculate-zones.dto';
import { EncodeWorkoutDto } from './dto/encode-workout.dto';
import { SportType, $Enums } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import {
  encodeTrackCourse,
  inspectTrackFile,
} from '@/importing/trackswap-file';
import {
  mapTrackFileRequestError,
  TRACK_FILE_REQUEST_ERROR,
  trackFileBadRequest,
} from '@/importing/track-file-request-error';
import { BusinessException } from '@/filters/business-exception/business.exception';
import { WorkoutService } from '../workout/workout.service';

const FIT_SPORT_BY_PUBLIC: Record<string, string> = {
  running: 'running',
  cycling: 'cycling',
  swimming: 'swimming',
  generic: 'generic',
  strength: 'generic',
};

function workoutFileName(name?: string) {
  const cleaned = (name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return cleaned || 'Trainingload Workout';
}

@Injectable()
export class PublicService {
  constructor(
    private readonly i18n: I18nService,
    private readonly workoutService: WorkoutService,
  ) {}

  calculateHeartRateZones(dto: CalculateHeartRateZonesDto) {
    const {
      maxHeartRate,
      restingHeartRate,
      lthr,
      heartRateZoneModel,
      sportType,
    } = dto;

    const profile = {
      maxHeartRate,
      restingHeartRate,
      lthr,
      heartRateZoneModel,
    };

    const result = generateHeartRateZonesFromProfile(
      profile,
      sportType || SportType.RUN,
    );

    if (!result) {
      throw new BadRequestException(
        this.i18n.t('common.error.failed_to_analyze_heart_rate_data'),
      );
    }

    // Translate zone names for Friel Running
    if (
      (heartRateZoneModel === $Enums.HeartRateZoneModel.FRIEL ||
        result.benchmark === $Enums.ZoneBase.LTHR) &&
      (sportType === SportType.RUN || !sportType) &&
      result.zones.length === 7
    ) {
      const keys = [
        'common.heart_rate_zone.friel.run.z1',
        'common.heart_rate_zone.friel.run.z2',
        'common.heart_rate_zone.friel.run.z3',
        'common.heart_rate_zone.friel.run.z4',
        'common.heart_rate_zone.friel.run.z5a',
        'common.heart_rate_zone.friel.run.z5b',
        'common.heart_rate_zone.friel.run.z5c',
      ];
      result.zones.forEach((zone, index) => {
        if (keys[index]) {
          zone.name = this.i18n.t(keys[index]);
        }
      });
    }

    return result;
  }

  async encodeFITCourseFromFile(file: Express.Multer.File) {
    if (!file?.buffer) {
      throw trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.REQUIRED, {
        origin: 'REQUEST',
      });
    }

    try {
      const content = await encodeTrackCourse(file.buffer);

      return {
        filename: `course_${Date.now()}.fit`,
        content,
      };
    } catch (error) {
      const fileError = mapTrackFileRequestError(error, {
        filename: file.originalname,
        targetFormat: 'fit',
      });
      if (fileError) throw fileError;
      throw error;
    }
  }

  async inspectActivityFile(file: Express.Multer.File) {
    if (!file?.buffer) {
      throw trackFileBadRequest(TRACK_FILE_REQUEST_ERROR.REQUIRED, {
        origin: 'REQUEST',
      });
    }

    try {
      return await inspectTrackFile(file.buffer, file.originalname);
    } catch (error) {
      const fileError = mapTrackFileRequestError(error, {
        filename: file.originalname,
      });
      if (fileError) throw fileError;
      throw error;
    }
  }

  /**
   * Encode a structured workout FIT from Trainingload Workout DSL.
   * Reuses WorkoutService.parsePlanText + buildFITFromPlan (same path as /workout/build).
   */
  async encodeWorkoutFromText(dto: EncodeWorkoutDto) {
    const text = dto.text.trim();
    if (!text) {
      throw new BadRequestException({
        code: 'WORKOUT_TEXT_REQUIRED',
        message: 'Workout text is required',
      });
    }

    let blocks;
    try {
      blocks = this.workoutService.parsePlanText(text);
    } catch (error) {
      const message =
        error instanceof BusinessException
          ? (error.getResponse() as { message?: string })?.message
          : error instanceof Error
            ? error.message
            : null;
      throw new BadRequestException({
        code: 'WORKOUT_DSL_INVALID',
        message: message || 'Workout DSL is invalid',
      });
    }

    if (!Array.isArray(blocks) || blocks.length === 0) {
      throw new BadRequestException({
        code: 'WORKOUT_PLAN_EMPTY',
        message: 'Workout has no steps',
      });
    }

    const name = workoutFileName(dto.name);
    try {
      const content = await this.workoutService.buildFITFromPlan(blocks, {
        sport: FIT_SPORT_BY_PUBLIC[dto.sport ?? ''] ?? 'running',
        subSport: dto.subSport,
        name,
      });
      return {
        filename: `${name}.fit`,
        content: Buffer.from(content),
      };
    } catch (error) {
      const message =
        error instanceof BusinessException
          ? (error.getResponse() as { message?: string })?.message
          : error instanceof Error
            ? error.message
            : null;
      throw new BadRequestException({
        code: 'WORKOUT_FIT_ENCODE_FAILED',
        message: message || 'Could not encode workout FIT',
      });
    }
  }
}
