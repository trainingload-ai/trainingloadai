import type { I18nService } from 'nestjs-i18n';
import type { CoachUiStreamYield } from './coach-ui-message-stream';
import { coachAssistantBlockIsUiSurface } from './coach-message.util';
import { coachSsePayloadForModelUnavailable } from './coach-message.util';
import { sanitizeCoachPublicSummary } from './coach-public-summary';

/**
 * Per-turn client output contract shared by typed SSE and UIMessage streams.
 * A successful terminal is valid only after visible text or a renderable card.
 */
export class CoachClientOutputGuard {
  private visibleText = '';
  private hasVisibleSurface = false;
  private hasTerminalResult = false;

  constructor(
    private readonly i18n: I18nService,
    private readonly lang: string,
  ) {}

  handle(event: CoachUiStreamYield): CoachUiStreamYield | null {
    if (event.type === 'activity') {
      const { publicSummary: candidate, ...activity } = event.activity;
      const publicSummary =
        activity.kind === 'analysis'
          ? sanitizeCoachPublicSummary(candidate, this.lang)
          : undefined;
      return {
        type: 'activity',
        activity: { ...activity, ...(publicSummary ? { publicSummary } : {}) },
      };
    }
    if (
      event.type === 'stream_event' &&
      event.event.type === 'reasoning_delta'
    ) {
      return null;
    }

    if (event.type === 'stream_event' && event.event.type === 'text_delta') {
      this.visibleText += event.event.text;
      return event;
    }

    if (event.type === 'assistant') {
      this.hasVisibleSurface ||= event.message.content.some(
        (block) =>
          block.type === 'tool_use' && coachAssistantBlockIsUiSurface(block),
      );
      return event;
    }

    if (event.type !== 'result') return event;

    this.hasTerminalResult = true;
    if (
      event.is_error ||
      this.visibleText.trim().length > 0 ||
      this.hasVisibleSurface
    ) {
      return event;
    }

    return this.emptyResponseResult(event.usage);
  }

  missingTerminalResult(): CoachUiStreamYield | null {
    if (this.hasTerminalResult) return null;
    this.hasTerminalResult = true;
    return this.emptyResponseResult();
  }

  private emptyResponseResult(usage?: unknown): CoachUiStreamYield {
    const fallback = coachSsePayloadForModelUnavailable({
      i18n: this.i18n,
      lang: this.lang,
    });
    return {
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      error_code: fallback.error_code,
      result: fallback.result,
      ...(usage !== undefined ? { usage } : {}),
    };
  }
}
