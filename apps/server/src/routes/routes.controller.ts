import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUserId } from '../utils/decorators/current-user-id.decorator';
import { SessionOnly } from '../oauth/session-only.decorator';
import { RoutesService } from './routes.service';
import { RoutesReadService } from './routes-read.service';
import { ROUTE_LIMITS } from './route-geometry';
@Controller('routes')
@SessionOnly()
export class RoutesController {
  constructor(
    private readonly routes: RoutesService,
    private readonly read: RoutesReadService,
  ) {}
  @Get() list(
    @CurrentUserId() userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.read.list(userId, cursor);
  }
  @Get(':id') detail(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.read.detail(userId, id);
  }
  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: ROUTE_LIMITS.bytes, files: 1, fields: 6 },
    }),
  )
  upload(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.routes.importGpx(userId, body, file);
  }
  @Post(':id/versions')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: ROUTE_LIMITS.bytes, files: 1, fields: 6 },
    }),
  )
  replace(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.routes.importGpx(userId, body, file, id);
  }
  @Get(':id/original') async original(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const bytes = await this.routes.original(userId, id);
    res.setHeader('Content-Type', 'application/gpx+xml');
    res.setHeader('Content-Disposition', 'attachment; filename="route.gpx"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(bytes);
  }
  @Delete(':id') remove(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: { expectedRevision: number },
  ) {
    return this.routes.remove(userId, id, body?.expectedRevision);
  }
}
