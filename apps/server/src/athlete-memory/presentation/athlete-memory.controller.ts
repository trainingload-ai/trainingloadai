import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { AthleteMemoryManagementService } from '../application/athlete-memory-management.service';
import { MemoryValidationError } from '../domain/memory-time';
import {
  AthleteMemoryFactParamDto,
  CorrectAthleteMemoryDto,
  ListAthleteMemoryDto,
  UpdateAthleteMemoryPreferenceDto,
} from './dto/athlete-memory.dto';

function translateMemoryError(error: unknown): never {
  if (error instanceof MemoryValidationError) {
    if (error.message.includes('version conflict')) {
      throw new ConflictException(error.message);
    }
    if (error.message.includes('not found')) {
      throw new NotFoundException(error.message);
    }
    throw new BadRequestException(error.message);
  }
  throw error;
}

@Controller('athlete-memory')
export class AthleteMemoryController {
  constructor(private readonly management: AthleteMemoryManagementService) {}

  @Get()
  async list(
    @CurrentUserId() userId: string,
    @Query() query: ListAthleteMemoryDto,
  ) {
    try {
      return await this.management.listForUser({ userId, ...query });
    } catch (error) {
      translateMemoryError(error);
    }
  }

  @Get('export')
  export(@CurrentUserId() userId: string) {
    return this.management.exportForUser(userId);
  }

  @Get('preference')
  preference(@CurrentUserId() userId: string) {
    return this.management.getPreference(userId);
  }

  @Put('preference')
  setPreference(
    @CurrentUserId() userId: string,
    @Body() body: UpdateAthleteMemoryPreferenceDto,
  ) {
    return this.management.setPreference({ userId, ...body });
  }

  @Patch(':factId')
  async correct(
    @CurrentUserId() userId: string,
    @Param() params: AthleteMemoryFactParamDto,
    @Body() body: CorrectAthleteMemoryDto,
  ) {
    try {
      return await this.management.correctByUser({
        userId,
        factId: params.factId,
        ...body,
      });
    } catch (error) {
      translateMemoryError(error);
    }
  }

  @Delete(':factId')
  async remove(
    @CurrentUserId() userId: string,
    @Param() params: AthleteMemoryFactParamDto,
  ) {
    const deleted = await this.management.deleteByUser({
      userId,
      factId: params.factId,
    });
    if (!deleted) throw new NotFoundException('Memory fact not found');
    return { ok: true };
  }
}
