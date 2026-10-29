import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

type RootResponse = { status: string; timestamp: string };

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/')
  @AllowAnonymous()
  rootHealthCheck(): RootResponse {
    return this.createRootResponse();
  }

  private createRootResponse(): RootResponse {
    return {
      status: 'OK',
      timestamp: new Date().toISOString(),
    };
  }
}
