import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { prismaModel, type PrismaClientSlice } from '@/prisma/prisma-db';

/**
 * Importing materializer 的 Activity 图写入口。
 * Repository 形态的 accessor，不 export 本类以外的表。
 */
@Injectable()
export class ActivityIngestService {
  constructor(private readonly prisma: PrismaService) {}

  activity(tx?: PrismaClientSlice<'activity'>) {
    return prismaModel(this.prisma, tx).activity;
  }

  activitySource(tx?: PrismaClientSlice<'activitySource'>) {
    return prismaModel(this.prisma, tx).activitySource;
  }

  activityLap(tx?: PrismaClientSlice<'activityLap'>) {
    return prismaModel(this.prisma, tx).activityLap;
  }

  activityZone(tx?: PrismaClientSlice<'activityZone'>) {
    return prismaModel(this.prisma, tx).activityZone;
  }

  activityCoggan(tx?: PrismaClientSlice<'activityCoggan'>) {
    return prismaModel(this.prisma, tx).activityCoggan;
  }

  activityBikeScore(tx?: PrismaClientSlice<'activityBikeScore'>) {
    return prismaModel(this.prisma, tx).activityBikeScore;
  }

  activitySwimScore(tx?: PrismaClientSlice<'activitySwimScore'>) {
    return prismaModel(this.prisma, tx).activitySwimScore;
  }

  activityGOVSS(tx?: PrismaClientSlice<'activityGOVSS'>) {
    return prismaModel(this.prisma, tx).activityGOVSS;
  }

  activityCalculatedPower(tx?: PrismaClientSlice<'activityCalculatedPower'>) {
    return prismaModel(this.prisma, tx).activityCalculatedPower;
  }

  activityTrimp(tx?: PrismaClientSlice<'activityTrimp'>) {
    return prismaModel(this.prisma, tx).activityTrimp;
  }

  activityVO2Max(tx?: PrismaClientSlice<'activityVO2Max'>) {
    return prismaModel(this.prisma, tx).activityVO2Max;
  }

  activityTrainingEffect(tx?: PrismaClientSlice<'activityTrainingEffect'>) {
    return prismaModel(this.prisma, tx).activityTrainingEffect;
  }

  activityPeakMetric(tx?: PrismaClientSlice<'activityPeakMetric'>) {
    return prismaModel(this.prisma, tx).activityPeakMetric;
  }

  activityPerformanceTT(tx?: PrismaClientSlice<'activityPerformanceTT'>) {
    return prismaModel(this.prisma, tx).activityPerformanceTT;
  }

  activityFitnessMetricsSnapshot(
    tx?: PrismaClientSlice<'activityFitnessMetricsSnapshot'>,
  ) {
    return prismaModel(this.prisma, tx).activityFitnessMetricsSnapshot;
  }

  activityPolyline(tx?: PrismaClientSlice<'activityPolyline'>) {
    return prismaModel(this.prisma, tx).activityPolyline;
  }

  activityPolylineSegment(tx?: PrismaClientSlice<'activityPolylineSegment'>) {
    return prismaModel(this.prisma, tx).activityPolylineSegment;
  }

  activityAiReview(tx?: PrismaClientSlice<'activityAiReview'>) {
    return prismaModel(this.prisma, tx).activityAiReview;
  }

  activityMapThumbJob(tx?: PrismaClientSlice<'activityMapThumbJob'>) {
    return prismaModel(this.prisma, tx).activityMapThumbJob;
  }

  activityThirdPartyMapping(
    tx?: PrismaClientSlice<'activityThirdPartyMapping'>,
  ) {
    return prismaModel(this.prisma, tx).activityThirdPartyMapping;
  }
}
