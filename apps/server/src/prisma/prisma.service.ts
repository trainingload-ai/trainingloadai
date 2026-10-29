import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super({
      log: ['warn', 'error'],
      errorFormat: 'pretty',
      // enableTracing: true,
    });
    this.$extends({
      model: {
        point: {},
      },
    });
  }
  async onModuleInit() {
    await this.$connect();
    if (process.env.SELF_HOST_MODE?.trim()) {
      const [state] = await this.$queryRaw<Array<{core: string | null; managed: string | null; singleOwner: boolean}>>`
        SELECT to_regclass('public._trainingload_core_migrations')::text AS core,
          to_regclass('public._prisma_migrations')::text AS managed,
          EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='t_user_single_owner_key') AS "singleOwner"
      `;
      if (!state?.core || state.managed || !state.singleOwner) {
        await this.$disconnect();
        throw Object.assign(new Error('SELF_HOST_DATABASE_LINEAGE_MISMATCH: apply the independent Core migrations before starting Self-host'),
          {code:'SELF_HOST_DATABASE_LINEAGE_MISMATCH'});
      }
    }
  }
}
