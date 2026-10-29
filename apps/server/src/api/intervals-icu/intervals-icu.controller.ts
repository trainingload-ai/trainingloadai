import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import { CurrentUserId } from '@/utils/decorators/current-user-id.decorator';
import { IntervalsIcuService } from './intervals-icu.service';
import {
  ConnectIntervalsIcuDto,
  StartIntervalsIcuOAuthDto,
  SyncIntervalsIcuDto,
  UpdateIntervalsIcuSettingsDto,
} from './dto/intervals-icu.dto';
import { RequiresRuntimeCapability } from '@/runtime-capabilities/requires-runtime-capability.decorator';

/** 用户侧 Intervals.icu 连接 / OAuth / 同步 HTTP 入口。 */
@Controller('intervals-icu')
@RequiresRuntimeCapability('intervals-icu-api-key')
export class IntervalsIcuController {
  constructor(private readonly intervalsIcuService: IntervalsIcuService) {}

  /** 当前连接状态与同步开关。 */
  @Get('status')
  async status(@CurrentUserId() userId: string) {
    return this.intervalsIcuService.getStatus(userId);
  }

  /** 用 API Key 连接或更新已有连接（含 key 更换二次确认）。 */
  @Post('connect')
  async connect(
    @CurrentUserId() userId: string,
    @Body() body: ConnectIntervalsIcuDto,
  ) {
    return this.intervalsIcuService.connect(userId, body);
  }

  /** 开始 OAuth：返回授权 URL；偏好设置写入签名 state。 */
  @Post('oauth/start')
  @RequiresRuntimeCapability('third-party-sync')
  async startOAuth(
    @CurrentUserId() userId: string,
    @Body() body: StartIntervalsIcuOAuthDto,
  ) {
    return this.intervalsIcuService.startOAuth(userId, body);
  }

  /** 仅更新同步/导出开关，不改凭证。 */
  @Patch('settings')
  async updateSettings(
    @CurrentUserId() userId: string,
    @Body() body: UpdateIntervalsIcuSettingsDto,
  ) {
    return this.intervalsIcuService.updateSettings(userId, body);
  }

  /** OAuth 回调（公开）：换 token、落库连接后 302 回前端/App。 */
  @Get('oauth/callback')
  @AllowAnonymous()
  @RequiresRuntimeCapability('third-party-sync')
  async oauthCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    // 完成 OAuth 回调
    const redirectUrl = await this.intervalsIcuService.completeOAuthCallback({
      code,
      state,
      error,
    });
    return res.redirect(302, redirectUrl);
  }

  /** 断开连接并清空落库凭证。 */
  @Delete('disconnect')
  async disconnect(@CurrentUserId() userId: string) {
    return this.intervalsIcuService.disconnect(userId);
  }

  /** 手动立即同步：活动（近 60 天）+ 可选计划课/wellness。 */
  @Post('sync')
  async sync(
    @CurrentUserId() userId: string,
    @Body() body: SyncIntervalsIcuDto,
  ) {
    return this.intervalsIcuService.syncLatest(userId, body);
  }
}
