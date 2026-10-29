import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RuntimeCapabilityService } from '@/runtime-capabilities/runtime-capability.service';
import type { LivenessResponse, ReadinessResponse } from './health.types';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runtimeCapabilities: RuntimeCapabilityService,
  ) {}

  liveness(): LivenessResponse {
    return {
      status: 'OK',
      timestamp: new Date().toISOString(),
    };
  }

  async readiness(): Promise<ReadinessResponse> {
    const configurationReady = this.runtimeCapabilities.snapshot().ready;
    let databaseReady = false;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      databaseReady = true;
    } catch {
      // Readiness is intentionally redacted. Database host names, credentials,
      // driver errors, and SQL details must stay in server-side logs only.
      databaseReady = false;
    }

    return {
      status: configurationReady && databaseReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: {
        configuration: configurationReady ? 'ready' : 'unavailable',
        database: databaseReady ? 'ready' : 'unavailable',
      },
    };
  }
}
