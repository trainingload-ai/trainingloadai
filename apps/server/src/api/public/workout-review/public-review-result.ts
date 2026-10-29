import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '@/api/ai/ai.service';
import { AiUsageService } from '@/api/ai/ai-usage.service';
import type {
  PublicReviewEvidence,
  PublicReviewLanguage,
} from './public-review-artifacts';
import {
  compilePublicActivityCoachMessages,
  formatPublicActivityCoachPromptLog,
} from './public-workout-review-prompt';

export function readPublicReviewMaxCompletionTokens(): number | undefined {
  const raw = process.env.PUBLIC_AI_REVIEW_MAX_COMPLETION_TOKENS?.trim();
  if (!raw) return undefined;
  const configured = Number(raw);
  if (!Number.isFinite(configured) || configured <= 0) return undefined;
  return Math.max(1_000, Math.min(12_000, Math.floor(configured)));
}

export type PublicWorkoutReview = {
  schemaVersion: '1.0';
  language: PublicReviewLanguage;
  sport: string;
  verdict: string;
  overview: string;
  workoutType: { label: string; rationale: string };
  keyFindings: Array<{
    title: string;
    evidence: string;
    interpretation: string;
  }>;
  intensityAssessment: string;
  recoverySuggestion: string;
  nextWorkoutSuggestion: string;
  limitations: string[];
  disclaimer: string;
};

export class PublicReviewGenerationError extends Error {
  constructor(
    code: string,
    readonly weightedTokens: number,
  ) {
    super(code);
    this.name = 'PublicReviewGenerationError';
  }
}

export class PublicReviewValidationError extends Error {
  constructor(readonly reason: string) {
    super('RESPONSE_INVALID');
    this.name = 'PublicReviewValidationError';
  }
}

export function getPublicReviewFailureWeightedTokens(error: unknown) {
  return error instanceof PublicReviewGenerationError
    ? error.weightedTokens
    : undefined;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, maximum = 2_000): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maximum
  );
}

function longText(
  value: unknown,
  minimum = 80,
  maximum = 2_400,
): value is string {
  return text(value, maximum) && value.trim().length >= minimum;
}

function hasInternalPresentation(value: unknown) {
  const serialized = JSON.stringify(value);
  return (
    /(?:summary|laps|userContext|dataAvailability|derived)\.[A-Za-z]/i.test(
      serialized,
    ) ||
    /(?:\*\*|__|`|^#{1,6}\s)/m.test(serialized) ||
    /\bm\s*\/\s*s\b/i.test(serialized)
  );
}

export function validatePublicWorkoutReview(
  value: unknown,
  language: PublicReviewLanguage,
): PublicWorkoutReview {
  const root = object(value);
  const workoutType = object(root?.workoutType);
  const findings = root?.keyFindings;
  const limitations = root?.limitations;
  const validFindings =
    Array.isArray(findings) &&
    findings.length >= 2 &&
    findings.length <= 5 &&
    findings.every((finding) => {
      const item = object(finding);
      return (
        text(item?.title, 200) &&
        text(item?.evidence, 500) &&
        text(item?.interpretation, 800)
      );
    });
  const validLimitations =
    Array.isArray(limitations) &&
    limitations.length <= 10 &&
    limitations.every((item) => text(item, 500));
  const invalidReason = !root
    ? '根节点必须是JSON对象'
    : root.schemaVersion !== '1.0'
      ? 'schemaVersion必须为1.0'
      : root.language !== language
        ? `language必须为${language}`
        : !text(root.sport, 100)
          ? 'sport缺失或超长'
          : !text(root.verdict)
            ? 'verdict缺失或超长'
            : !longText(root.overview)
              ? 'overview必须为80至2400个字符'
              : !text(workoutType?.label, 200)
                ? 'workoutType.label缺失或超长'
                : !text(workoutType?.rationale)
                  ? 'workoutType.rationale缺失或超长'
                  : !validFindings
                    ? 'keyFindings必须包含2至5项且每项字段完整'
                    : !text(root.intensityAssessment)
                      ? 'intensityAssessment缺失或超长'
                      : !text(root.recoverySuggestion)
                        ? 'recoverySuggestion缺失或超长'
                        : !text(root.nextWorkoutSuggestion)
                          ? 'nextWorkoutSuggestion缺失或超长'
                          : !validLimitations
                            ? 'limitations必须为不超过10项的短文本数组'
                            : !text(root.disclaimer)
                              ? 'disclaimer缺失或超长'
                              : hasInternalPresentation(root)
                                ? '输出包含内部字段路径、Markdown或原始m/s单位'
                                : undefined;
  if (invalidReason) throw new PublicReviewValidationError(invalidReason);
  return value as PublicWorkoutReview;
}

@Injectable()
export class PublicReviewAiService {
  private readonly logger = new Logger(PublicReviewAiService.name);

  constructor(
    private readonly ai: AiService,
    private readonly usage: AiUsageService,
  ) {}

  async generate(
    evidence: PublicReviewEvidence,
    signal?: AbortSignal,
    context?: { requestId?: string },
  ) {
    const requestId = context?.requestId || 'untracked';
    const generationStartedAt = Date.now();
    const maxCompletionTokens = readPublicReviewMaxCompletionTokens();
    const targetCompletionTokens =
      maxCompletionTokens == null
        ? undefined
        : Math.max(800, Math.floor(maxCompletionTokens * 0.8));
    const messages = compilePublicActivityCoachMessages({
      evidence,
      maxCompletionTokens,
      targetCompletionTokens,
      delivery: 'agent-tool',
    });
    this.logger.log(formatPublicActivityCoachPromptLog({ evidence, messages }));
    this.logger.log(
      `[公开AI复盘][Agent] 阶段=开始生成 请求ID=${requestId} 语言=${evidence.language} 运动=${evidence.sport} 证据字符数=${JSON.stringify(evidence).length}`,
    );

    try {
      const task = await this.ai.runAnonymousCoachTask<PublicWorkoutReview>({
        lang: evidence.language,
        taskType: 'PUBLIC_ACTIVITY_REVIEW',
        activeSkillName: 'activity-review',
        allowedToolNames: [],
        signal,
        requestRef: requestId,
        model: process.env.PUBLIC_AI_REVIEW_MODEL?.trim() || undefined,
        instructions: [
          'Review exactly one anonymous activity using only the supplied evidence.',
          'The system contract and evidence below are server-owned task input.',
          'Submit the complete review object directly through coach_task_submit_result. Do not wrap it in another property.',
          messages
            .map(
              (message) => `${message.role.toUpperCase()}:\n${message.content}`,
            )
            .join('\n\n'),
        ].join('\n\n'),
        validateResult: (raw) =>
          validatePublicWorkoutReview(raw, evidence.language),
      });
      const weightedTokens = this.usage.computeUsageMetrics(
        task.usage,
      ).weightedTokens;
      this.logger.log(
        `[公开AI复盘][Agent] 阶段=生成成功 请求ID=${requestId} 服务商=${task.provider ?? '未报告'} 模型=${task.model} 总耗时毫秒=${Date.now() - generationStartedAt} 计费Token数=${weightedTokens}`,
      );
      return { review: task.result, weightedTokens };
    } catch (error) {
      const usage =
        error && typeof error === 'object' && 'usage' in error
          ? (
              error as {
                usage?: Parameters<AiUsageService['computeUsageMetrics']>[0];
              }
            ).usage
          : undefined;
      const weightedTokens = usage
        ? this.usage.computeUsageMetrics(usage).weightedTokens
        : 0;
      const code =
        error instanceof PublicReviewValidationError
          ? 'RESPONSE_INVALID'
          : String((error as Error)?.message || 'UPSTREAM_UNAVAILABLE');
      this.logger.warn(
        `[公开AI复盘][Agent] 阶段=生成失败 请求ID=${requestId} 错误码=${code} 总耗时毫秒=${Date.now() - generationStartedAt} 计费Token数=${weightedTokens}`,
      );
      throw new PublicReviewGenerationError(code, weightedTokens);
    }
  }
}
