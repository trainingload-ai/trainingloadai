import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { ReviewDigestRepository } from './persistence/review-digest.repository';
import { ReviewDigestQueryService } from './review-digest-query.service';

@Module({
  imports: [PrismaModule],
  providers: [ReviewDigestRepository, ReviewDigestQueryService],
  exports: [ReviewDigestQueryService],
})
export class ReviewDigestQueryModule {}
