import {
  Body,
  Controller,
  Headers,
  Logger,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import {
  PublicReviewWorkflowService,
  type PublicReviewForm,
} from './public-review-workflow.service';
import { getPublicReviewFailureWeightedTokens } from './public-review-result';
import { RequiresRuntimeCapability } from '@/runtime-capabilities/requires-runtime-capability.decorator';

const FILE_MAX_BYTES =
  Number(process.env.PUBLIC_AI_REVIEW_FILE_MAX_BYTES) || 26_214_400;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 180_000;

export function readPublicReviewUpstreamTimeoutMs() {
  const configured = Number(process.env.PUBLIC_AI_REVIEW_UPSTREAM_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_UPSTREAM_TIMEOUT_MS;
  }
  return Math.max(10_000, Math.min(300_000, Math.floor(configured)));
}

function safeGenerationErrorCode(error: unknown) {
  const code = String((error as Error)?.message || 'INTERNAL_ERROR');
  return ['UPSTREAM_UNAVAILABLE', 'RESPONSE_INVALID'].includes(code)
    ? code
    : 'INTERNAL_ERROR';
}

@Controller('public')
@RequiresRuntimeCapability('ai')
export class PublicReviewController {
  private readonly logger = new Logger(PublicReviewController.name);

  constructor(private readonly workflow: PublicReviewWorkflowService) {}

  @Post('ai-workout-review-admissions')
  @AllowAnonymous()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async createAdmission(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.workflow.createAdmission({
      cookieHeader: req.headers.cookie,
      ip: req.ip || req.socket.remoteAddress || 'unknown',
    });
    res.setHeader('Cache-Control', 'no-store');
    if (result.setCookie) res.setHeader('Set-Cookie', result.setCookie);
    return result.body;
  }

  @Post('ai-workout-reviews')
  @AllowAnonymous()
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: FILE_MAX_BYTES, files: 1 },
    }),
  )
  async createReview(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() form: PublicReviewForm,
    @Headers('x-public-review-admission') admissionToken: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const prepared = await this.workflow.prepareReview({
      file,
      form,
      admissionToken,
      cookieHeader: req.headers.cookie,
      ip: req.ip || req.socket.remoteAddress || 'unknown',
    });
    const requestId = randomUUID();
    const startedAt = Date.now();
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const write = (event: unknown) => res.write(`${JSON.stringify(event)}\n`);
    write({ type: 'progress', stage: 'parsing' });
    write({ type: 'visualization', data: prepared.visualization });
    write({ type: 'progress', stage: 'sanitizing' });
    write({ type: 'progress', stage: 'reviewing' });

    const abort = new AbortController();
    let clientDisconnected = false;
    let timedOut = false;
    const onAborted = () => {
      clientDisconnected = true;
      abort.abort(new Error('REQUEST_CANCELLED'));
    };
    const onResponseClosed = () => {
      if (res.writableEnded) return;
      clientDisconnected = true;
      abort.abort(new Error('REQUEST_CANCELLED'));
    };
    req.once('aborted', onAborted);
    res.once('close', onResponseClosed);
    const timeoutMs = readPublicReviewUpstreamTimeoutMs();
    const timeout = setTimeout(() => {
      timedOut = true;
      abort.abort(new Error('UPSTREAM_TIMEOUT'));
    }, timeoutMs);
    const heartbeat = setInterval(() => {
      if (!res.destroyed) write({ type: 'heartbeat' });
    }, 15_000);
    this.logger.log(
      `[公开AI复盘] 阶段=开始生成 请求ID=${requestId} 超时上限毫秒=${timeoutMs}`,
    );
    try {
      const generated = await this.workflow.generateReview(
        prepared.evidence,
        abort.signal,
        { requestId },
      );
      await this.workflow.settle({
        reservationId: prepared.reservationId,
        outcome: 'SUCCEEDED',
        actualWt: generated.weightedTokens,
      });
      write({ type: 'result', requestId, data: generated.review });
      this.logger.log(
        `[公开AI复盘] 结果=成功 请求ID=${requestId} 总耗时毫秒=${Date.now() - startedAt} 计费Token数=${generated.weightedTokens}`,
      );
    } catch (error) {
      const code = timedOut
        ? 'UPSTREAM_TIMEOUT'
        : clientDisconnected
          ? 'REQUEST_CANCELLED'
          : safeGenerationErrorCode(error);
      await this.workflow.settle({
        reservationId: prepared.reservationId,
        outcome: clientDisconnected ? 'CANCELLED' : 'FAILED',
        actualWt: getPublicReviewFailureWeightedTokens(error),
      });
      this.logger.warn(
        `[公开AI复盘] 结果=${clientDisconnected ? '客户端已取消' : '失败'} 请求ID=${requestId} 错误码=${code} 总耗时毫秒=${Date.now() - startedAt} 超时上限毫秒=${timeoutMs}`,
      );
      if (!res.destroyed) {
        write({
          type: 'error',
          requestId,
          code,
          message: 'The workout review could not be completed.',
          retryable: code !== 'REQUEST_CANCELLED',
        });
      }
    } finally {
      clearTimeout(timeout);
      clearInterval(heartbeat);
      req.off('aborted', onAborted);
      res.off('close', onResponseClosed);
      if (!res.destroyed) res.end();
    }
  }
}
