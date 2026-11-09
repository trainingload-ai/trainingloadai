import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import { z } from 'zod';
import type { PersonalProvider } from '@shared/personal-integrations';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { RequiresRuntimeCapability } from '@/runtime-capabilities/requires-runtime-capability.decorator';
import { PrismaService } from '@/prisma/prisma.service';
import { SelfHostOwnerGuard } from '@/self-host/self-host-owner.guard';
import {
  PersonalConnectionService,
  personalRegion,
  personalSettings,
} from '@/integrations/personal/personal-connection.service';
import { PersonalSyncService } from '@/integrations/personal/personal-sync.service';
import { PersonalWriteService } from '@/integrations/personal/personal-write.service';
import { PersonalProviderError } from '@/integrations/personal/personal-errors';
import { personalAccountRef } from '@/integrations/personal/personal-identity';
import { GarminPersonalClient } from '@/integrations/garmin-personal/garmin-personal.client';
import {
  GARMIN_RESOURCES,
  garminResourceRequest,
} from '@/integrations/garmin-personal/garmin-personal-resources';

class PersonalController {
  constructor(
    protected readonly provider: PersonalProvider,
    protected readonly connections: PersonalConnectionService,
    protected readonly sync: PersonalSyncService,
    protected readonly prisma: PrismaService,
  ) {}
  @Get('status')
  status(@CurrentUserId() userId: string) {
    return this.connections.status(userId, this.provider);
  }
  @Patch('settings')
  settings(@CurrentUserId() userId: string, @Body() body: unknown) {
    return this.connections.settings(userId, this.provider, body);
  }
  @Delete('disconnect')
  disconnect(@CurrentUserId() userId: string) {
    return this.connections.disconnect(userId, this.provider);
  }
  @Post('sync')
  syncNow(@CurrentUserId() userId: string, @Body() body: unknown) {
    return this.sync.enqueue(userId, this.provider, body);
  }
  @Post('sync/focus')
  syncFocus(@CurrentUserId() userId: string) {
    return this.sync.enqueueFocus(userId, this.provider);
  }
  @Get('jobs/:jobId')
  async job(@CurrentUserId() userId: string, @Param('jobId') id: string) {
    const job = await this.prisma.personalProviderJob.findFirst({
      where: { id, connection: { userId, provider: this.provider } },
      select: {
        id: true,
        kind: true,
        status: true,
        result: true,
        errorCode: true,
        createdAt: true,
        updatedAt: true,
        nextAttemptAt: true,
      },
    });
    if (!job)
      throw new PersonalProviderError('PROVIDER_JOB_NOT_FOUND', undefined, 404);
    return job;
  }
}

@Controller('/api/garmin-personal')
@RequiresRuntimeCapability('garmin-personal-api-key')
@UseGuards(SelfHostOwnerGuard)
export class GarminPersonalController extends PersonalController {
  constructor(
    connections: PersonalConnectionService,
    sync: PersonalSyncService,
    prisma: PrismaService,
    private readonly garmin: GarminPersonalClient,
  ) {
    super('garmin', connections, sync, prisma);
  }
  @Post('connect')
  async connect(@CurrentUserId() userId: string, @Body() body: unknown) {
    const status = await this.connections.connectGarmin(userId, body);
    try {
      await this.sync.enqueueAfterConnect(userId, 'garmin');
    } catch {
      // Connection already succeeded; worker/manual sync can retry.
    }
    return status;
  }
  @Get('resources')
  resources() {
    return Object.entries(GARMIN_RESOURCES)
      .filter(([, value]) => !('binary' in value))
      .map(([name, value]) => ({
        name,
        sensitive: 'sensitive' in value,
        activity: 'activity' in value,
      }));
  }
  @Post('read/:resource')
  async read(
    @CurrentUserId() userId: string,
    @Param('resource') resource: string,
    @Body() body: unknown,
  ) {
    const parsed = z
      .object({
        date: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        activityId: z.string().optional(),
        offset: z.number().int().min(0).max(100_000).optional(),
        sensitiveConfirmed: z.boolean().optional(),
      })
      .strict()
      .safeParse(body);
    if (!parsed.success)
      throw new PersonalProviderError(
        'PROVIDER_ARGUMENTS_INVALID',
        undefined,
        400,
      );
    const connection = await this.connections.require(userId, 'garmin');
    const request = garminResourceRequest(
      resource,
      parsed.data,
      personalSettings(connection).timezone,
    );
    if (request.binary)
      throw new PersonalProviderError(
        'PROVIDER_USE_ACTIVITY_SYNC',
        undefined,
        400,
      );
    return {
      data: await this.connections.authorized(connection.id, (c, token) =>
        this.garmin.get(personalRegion(c), token, request.path, request.query),
      ),
    };
  }
}

@Controller('/api/coros-mcp')
@RequiresRuntimeCapability('coros-mcp')
@UseGuards(SelfHostOwnerGuard)
export class CorosPersonalController extends PersonalController {
  constructor(
    connections: PersonalConnectionService,
    sync: PersonalSyncService,
    prisma: PrismaService,
    private readonly writes: PersonalWriteService,
  ) {
    super('coros', connections, sync, prisma);
  }
  @Post('oauth/start')
  startOAuth(@CurrentUserId() userId: string, @Body() body: unknown) {
    return this.connections.startCoros(userId, body);
  }
  @Get('tools')
  async tools(@CurrentUserId() userId: string) {
    return this.connections.tools(
      await this.connections.require(userId, 'coros'),
    );
  }
  @Post('read/:tool')
  async read(
    @CurrentUserId() userId: string,
    @Param('tool') tool: string,
    @Body() body: unknown,
  ) {
    // FIT requests share a durable 50-file budget. They can only run through the worker.
    if (tool === 'queryActivityFitFileDownloadUrls')
      throw new PersonalProviderError(
        'PROVIDER_USE_ACTIVITY_SYNC',
        undefined,
        400,
      );
    const parsed = z.record(z.string(), z.unknown()).safeParse(body);
    if (!parsed.success || JSON.stringify(body).length > 32_768)
      throw new PersonalProviderError(
        'PROVIDER_ARGUMENTS_INVALID',
        undefined,
        400,
      );
    const connection = await this.connections.require(userId, 'coros');
    return {
      data: await this.connections.readCoros(connection.id, tool, parsed.data),
    };
  }
  @Post('operations/preview')
  preview(@CurrentUserId() userId: string, @Body() body: unknown) {
    return this.writes.preview(userId, body);
  }
  @Post('operations/:operationId/confirm')
  confirm(
    @CurrentUserId() userId: string,
    @Param('operationId') id: string,
    @Body() body: unknown,
  ) {
    return this.writes.confirm(userId, id, body);
  }
  @Post('operations/:operationId/reconcile')
  async reconcile(
    @CurrentUserId() userId: string,
    @Param('operationId') id: string,
  ) {
    const connection = await this.connections.require(userId, 'coros');
    const changed = await this.prisma.personalProviderJob.updateMany({
      where: {
        id,
        connectionId: connection.id,
        kind: 'WRITE',
        status: 'UNKNOWN',
        payload: {
          path: ['accountRef'],
          equals: personalAccountRef(connection),
        },
      },
      data: { nextAttemptAt: new Date(), attempts: 0 },
    });
    if (!changed.count)
      throw new PersonalProviderError(
        'PROVIDER_JOB_NOT_RECONCILABLE',
        undefined,
        409,
      );
    return { status: 'UNKNOWN', reconciling: true };
  }
}

/** Provider redirects use one-time state, while interactive routes require
 * the Self-host Owner. Keep the anonymous exception in its own controller. */
@Controller('/api/coros-mcp/oauth')
@RequiresRuntimeCapability('coros-mcp')
export class CorosOAuthCallbackController {
  constructor(
    private readonly connections: PersonalConnectionService,
    private readonly sync: PersonalSyncService,
  ) {}
  @Get('callback')
  @AllowAnonymous()
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.connections.callback(code, state, error);
    if (result.connectedUserId) {
      try {
        await this.sync.enqueueAfterConnect(result.connectedUserId, 'coros');
      } catch {
        // Connection already succeeded; worker/manual sync can retry.
      }
    }
    return res.redirect(302, result.redirectUrl);
  }
}
