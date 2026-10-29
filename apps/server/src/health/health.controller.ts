import { Controller, Get, Res } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import { HealthService } from './health.service';
import type { LivenessResponse, ReadinessResponse } from './health.types';
import { RawResponse } from '@/response-envelope';

@RawResponse()
@Controller('/api/health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @AllowAnonymous()
  liveness(): LivenessResponse {
    return this.health.liveness();
  }

  @Get('/live')
  @AllowAnonymous()
  live(): LivenessResponse {
    return this.health.liveness();
  }

  @Get('/ready')
  @AllowAnonymous()
  async ready(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessResponse> {
    const readiness = await this.health.readiness();
    if (readiness.status !== 'ready') response.status(503);
    return readiness;
  }
}
