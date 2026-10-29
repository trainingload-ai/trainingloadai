import { Module } from '@nestjs/common';
import { PublicDemoTokenService } from './public-demo-token.service';

@Module({
  providers: [PublicDemoTokenService],
  exports: [PublicDemoTokenService],
})
export class PublicDemoModule {}
