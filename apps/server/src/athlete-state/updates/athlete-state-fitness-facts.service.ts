import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import type { PrismaTx } from '@/prisma/prisma-db';
import { selectEffectiveFitnessMetric } from '@/api/user/fitness-metric-selection';
import { AthleteStateUpdates } from './athlete-state-updates.service';

@Injectable()
export class AthleteStateFitnessFacts {
  constructor(
    private readonly prisma: PrismaService,
    private readonly updates: AthleteStateUpdates,
  ) {}
  async read(userId: string, at = new Date(), tx?: PrismaTx) {
    const rows = await (tx ?? this.prisma).userFitnessMetric.findMany({
      where: {
        userId,
        type: { in: ['FTP', 'VO2_MAX'] },
        source: { in: ['MANUAL', 'AUTO'] },
        recordedAt: { lte: at },
      },
      orderBy: { recordedAt: 'desc' },
      distinct: ['type', 'sport', 'source'],
    });
    return [...new Set(rows.map((row) => `${row.type}:${row.sport}`))]
      .sort()
      .flatMap((key) => {
        const [type, sport] = key.split(':');
        const row = selectEffectiveFitnessMetric(rows, type, sport);
        return row
          ? [
              {
                type: row.type,
                sport: row.sport,
                value: row.value,
                unit: row.type === 'FTP' ? 'W' : 'ml/kg/min',
                effectiveAt: row.recordedAt.toISOString(),
                source: row.source,
                provider: row.originProvider,
              },
            ]
          : [];
      });
  }
  async observe<T>(userId: string, tx: PrismaTx, write: () => Promise<T>) {
    const before = await this.read(userId, new Date(), tx);
    const result = await write();
    const after = await this.read(userId, new Date(), tx);
    // A new revision or row with identical effective values is not new evidence.
    const values = (facts: typeof before) =>
      JSON.stringify(facts.map(({ effectiveAt: _at, ...fact }) => fact));
    if (values(before) !== values(after))
      await this.updates.requestUpdate(
        { userId, triggerType: 'FITNESS_FACT_CHANGED' },
        tx,
      );
    return result;
  }
}
