import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';

import { CreateUserDataExportDto } from './user-data-export.dto';
import { UserDataExportService } from './user-data-export.service';

@Controller('users/data-exports')
@Throttle({ default: { ttl: 60_000, limit: 60 } })
export class UserDataExportController {
  constructor(private readonly exportsService: UserDataExportService) {}

  @Post()
  @Throttle({ default: { ttl: 60 * 60_000, limit: 3 } })
  @HttpCode(HttpStatus.ACCEPTED)
  async create(
    @CurrentUserId() userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: CreateUserDataExportDto,
  ) {
    return await this.exportsService.create({
      userId,
      idempotencyKey: String(idempotencyKey ?? ''),
      mode: body.mode,
      locationPrivacy: body.locationPrivacy,
      includeOriginalFiles: body.includeOriginalFiles,
    });
  }

  @Get()
  async list(@CurrentUserId() userId: string) {
    return await this.exportsService.list(userId);
  }

  @Get(':id')
  async get(@CurrentUserId() userId: string, @Param('id') id: string) {
    return await this.exportsService.get(userId, id);
  }

  @Get(':id/download')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async download(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const file = await this.exportsService.openDownload(userId, id);
    const safeFileName = file.fileName.replace(/[\r\n"\\]/g, '_');
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Length', file.sizeBytes.toString());
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Digest',
      `sha-256=${Buffer.from(file.sha256, 'hex').toString('base64')}`,
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    file.stream.on('error', (error) => response.destroy(error));
    file.stream.pipe(response);
  }

  @Delete(':id')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async remove(@CurrentUserId() userId: string, @Param('id') id: string) {
    return await this.exportsService.remove(userId, id);
  }
}
