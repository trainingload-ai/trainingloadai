import { Controller, Get } from '@nestjs/common';
import { SessionOnly } from '@/oauth/session-only.decorator';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { SelfHostBootstrapService } from './self-host-bootstrap.service';

@Controller('/api/self-host/session')
@SessionOnly()
export class SelfHostSessionController {
  constructor(private readonly bootstrap: SelfHostBootstrapService) {}

  @Get('/policy')
  async policy(@CurrentUserId() userId: string) {
    try {
      return await this.bootstrap.getSessionPolicy(userId);
    } catch (error) {
      throw this.bootstrap.toHttpException(error);
    }
  }
}
