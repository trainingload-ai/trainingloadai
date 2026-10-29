import { Body, Controller, Get, Header, Post, Req } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Throttle } from '@nestjs/throttler';
import { SelfHostBootstrapService } from './self-host-bootstrap.service';
import {
  SelfHostBootstrapError,
  type BootstrapLocalOwnerInput,
  type BootstrapOwnerInput,
} from './self-host-bootstrap.types';
import { checkLocalBrowserRequest } from './self-host-local-access-policy';
import type { Request } from 'express';

function toWebHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(key, item));
    } else if (value != null) {
      headers.set(key, String(value));
    }
  }
  return headers;
}

@Controller('/api/self-host/bootstrap')
@AllowAnonymous()
export class SelfHostBootstrapController {
  constructor(private readonly bootstrap: SelfHostBootstrapService) {}

  @Get('/status')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Header('Cache-Control', 'no-store')
  async status() {
    try {
      return await this.bootstrap.ensureBootstrapToken();
    } catch (error) {
      throw this.bootstrap.toHttpException(error);
    }
  }

  @Post('/owner')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Header('Cache-Control', 'no-store')
  async createOwner(@Body() body: BootstrapOwnerInput) {
    try {
      return await this.bootstrap.bootstrapOwner(body);
    } catch (error) {
      throw this.bootstrap.toHttpException(error);
    }
  }

  @Post('/local-owner')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Header('Cache-Control', 'no-store')
  async createLocalOwner(
    @Req() request: Request,
    @Body() body: BootstrapLocalOwnerInput,
  ) {
    try {
      const access = checkLocalBrowserRequest(toWebHeaders(request));
      if ('reason' in access) {
        throw new SelfHostBootstrapError(
          access.reason === 'LOCAL_ACCESS_DISABLED'
            ? 'SELF_HOST_LOCAL_ACCESS_DISABLED'
            : 'SELF_HOST_LOCAL_ACCESS_FORBIDDEN',
        );
      }
      return await this.bootstrap.bootstrapLocalOwner(body);
    } catch (error) {
      throw this.bootstrap.toHttpException(error);
    }
  }
}
