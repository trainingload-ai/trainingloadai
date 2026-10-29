import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { competitionDb, type CompetitionDb } from './competition-db';

@Injectable()
export class CompetitionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: CompetitionDb) {
    return competitionDb(this.prisma, tx);
  }

  findEvent<T extends Prisma.CompetitionEventFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.CompetitionEventFindFirstArgs>,
    tx?: CompetitionDb,
  ) {
    return this.db(tx).competitionEvent.findFirst(args);
  }

  findEventUnique<T extends Prisma.CompetitionEventFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.CompetitionEventFindUniqueArgs>,
    tx?: CompetitionDb,
  ) {
    return this.db(tx).competitionEvent.findUnique(args);
  }

  findEventUniqueOrThrow<
    T extends Prisma.CompetitionEventFindUniqueOrThrowArgs,
  >(
    args: Prisma.SelectSubset<T, Prisma.CompetitionEventFindUniqueOrThrowArgs>,
    tx?: CompetitionDb,
  ) {
    return this.db(tx).competitionEvent.findUniqueOrThrow(args);
  }

  findEvents<T extends Prisma.CompetitionEventFindManyArgs>(
    args?: Prisma.SelectSubset<T, Prisma.CompetitionEventFindManyArgs>,
    tx?: CompetitionDb,
  ) {
    return this.db(tx).competitionEvent.findMany(args);
  }

  createEvent<T extends Prisma.CompetitionEventCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.CompetitionEventCreateArgs>,
    tx?: CompetitionDb,
  ) {
    return this.db(tx).competitionEvent.create(args);
  }

  updateEvents<T extends Prisma.CompetitionEventUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.CompetitionEventUpdateManyArgs>,
    tx?: CompetitionDb,
  ) {
    return this.db(tx).competitionEvent.updateMany(args);
  }

  createRevision<T extends Prisma.CompetitionEventRevisionCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.CompetitionEventRevisionCreateArgs>,
    tx?: CompetitionDb,
  ) {
    return this.db(tx).competitionEventRevision.create(args);
  }

  findAssessmentUnique<
    T extends Prisma.CompetitionImpactAssessmentFindUniqueArgs,
  >(
    args: Prisma.SelectSubset<
      T,
      Prisma.CompetitionImpactAssessmentFindUniqueArgs
    >,
    tx?: CompetitionDb,
  ) {
    return this.db(tx).competitionImpactAssessment.findUnique(args);
  }

  findAssessmentUniqueOrThrow<
    T extends Prisma.CompetitionImpactAssessmentFindUniqueOrThrowArgs,
  >(
    args: Prisma.SelectSubset<
      T,
      Prisma.CompetitionImpactAssessmentFindUniqueOrThrowArgs
    >,
    tx?: CompetitionDb,
  ) {
    return this.db(tx).competitionImpactAssessment.findUniqueOrThrow(args);
  }

  upsertAssessment<T extends Prisma.CompetitionImpactAssessmentUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.CompetitionImpactAssessmentUpsertArgs>,
    tx?: CompetitionDb,
  ) {
    return this.db(tx).competitionImpactAssessment.upsert(args);
  }

  runTransaction<T>(
    fn: (tx: CompetitionDb) => Promise<T>,
    tx?: CompetitionDb,
  ): Promise<T> {
    return tx ? fn(tx) : this.prisma.$transaction((client) => fn(client));
  }
}
