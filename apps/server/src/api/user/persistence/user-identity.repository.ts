import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { prismaModel, type PrismaClientSlice } from '@/prisma/prisma-db';

@Injectable()
export class UserIdentityRepository {
  constructor(private readonly prisma: PrismaService) {}

  users(tx?: PrismaClientSlice<'t_user'>) {
    return prismaModel(this.prisma, tx).t_user;
  }

  profiles(tx?: PrismaClientSlice<'userProfile'>) {
    return prismaModel(this.prisma, tx).userProfile;
  }

  settings(tx?: PrismaClientSlice<'userSetting'>) {
    return prismaModel(this.prisma, tx).userSetting;
  }

  bodyMetrics(tx?: PrismaClientSlice<'userBodyMetric'>) {
    return prismaModel(this.prisma, tx).userBodyMetric;
  }

  fitnessMetrics(tx?: PrismaClientSlice<'userFitnessMetric'>) {
    return prismaModel(this.prisma, tx).userFitnessMetric;
  }

  zoneSettings(tx?: PrismaClientSlice<'userZoneSetting'>) {
    return prismaModel(this.prisma, tx).userZoneSetting;
  }
}
