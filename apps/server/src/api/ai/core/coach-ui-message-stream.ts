import { type ServerResponse } from 'http';
import {
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  type UIMessage,
  type UIMessageStreamWriter,
  type UIMessageChunk,
} from 'ai';
import type {
  CoachRunDataParts,
  CoachRunMetadata,
} from '@shared/ai-coach-run-contract';
import type {
  CoachProgressCode,
  CoachQueryYield,
  CoachUserToolResultBlock,
} from './coach-query-yield';
import { coachAssistantBlockIsUiSurface } from './coach-message.util';
import {
  COACH_TURN_ERROR_PART_TYPE,
  type CoachTurnErrorData,
} from '@shared/coach-turn-error';

export type CoachAssistantToolData = {
  toolCallId: string;
  name: string;
  input: unknown;
};

export type CoachUserToolResultData = {
  toolUseId: string;
  content: unknown;
  isError?: boolean;
};

export type CoachStatusData = {
  status: 'running' | 'model' | 'tool_run';
  step?: number;
  progress?: CoachProgressCode;
};

export type CoachToolProgressData = {
  toolName: string;
  status: 'issued' | 'start' | 'end' | 'done';
  ok?: boolean;
  resultCount?: number;
  toolNames?: string[];
};

export type CoachContextWindowData = {
  step: number;
  maxContextTokens: number;
  reservedOutputTokens: number;
  inputBudgetTokens: number;
  usedInputTokens: number;
  remainingInputTokens: number;
  compressionThresholdTokens: number;
  usageRatio: number;
  estimator: 'chars_div_4' | 'mixed_chars_v1';
  compressed: boolean;
  compactedMessages: number;
};

export type CoachBranchOpenedData = {
  id: string;
  contextId: string;
  status: string;
  baseEventSeq?: number;
  baseCommitId?: string | null;
};

export type CoachUiDataParts = CoachRunDataParts & {
  'coach-operation': { operation: unknown };
  'coach-tool': CoachAssistantToolData;
  'coach-user-tool-result': CoachUserToolResultData;
  'coach-status': CoachStatusData;
  'coach-tool-progress': CoachToolProgressData;
  'coach-context-window': CoachContextWindowData;
  'coach-branch-opened': CoachBranchOpenedData;
  'coach-turn-error': CoachTurnErrorData;
};

export type CoachUiMessage = UIMessage<CoachRunMetadata, CoachUiDataParts>;
export type CoachUiChunk = UIMessageChunk<CoachRunMetadata, CoachUiDataParts>;

export type CoachBranchOpenedYield = {
  type: 'branch';
  subtype: 'opened';
  branch: CoachBranchOpenedData;
};

export type CoachUiStreamYield =
  | CoachQueryYield
  | CoachBranchOpenedYield
  | { type: 'ui_chunk'; chunk: CoachUiChunk };

function isCoachBranchOpenedYield(
  event: CoachUiStreamYield,
): event is CoachBranchOpenedYield {
  return event.type === 'branch' && event.subtype === 'opened';
}

function writeCoachUserToolResultParts(
  writer: UIMessageStreamWriter<CoachUiMessage>,
  block: CoachUserToolResultBlock,
) {
  writer.write({
    type: 'data-coach-user-tool-result',
    id: block.tool_use_id,
    data: {
      toolUseId: block.tool_use_id,
      content: block.content,
      ...(typeof block.is_error === 'boolean'
        ? { isError: block.is_error }
        : {}),
    },
  });
}

export function coachQueryYieldsToUIMessageStream(
  source: AsyncIterable<CoachUiStreamYield>,
  options?: {
    originalMessages?: CoachUiMessage[];
  },
) {
  return createUIMessageStream<CoachUiMessage>({
    originalMessages: options?.originalMessages,
    execute: async ({ writer }) => {
      let textSegment = 0;
      let activeTextId: string | null = null;
      let hasTerminalError = false;

      const closeTextSegment = () => {
        if (!activeTextId) return;
        writer.write({ type: 'text-end', id: activeTextId });
        activeTextId = null;
      };

      let started = false;
      let projected = false;

      for await (const event of source) {
        if (event.type === 'ui_chunk') {
          projected = true;
          writer.write(event.chunk);
          continue;
        }
        if (!started) {
          writer.write({ type: 'start' });
          writer.write({ type: 'start-step' });
          started = true;
        }
        if (
          event.type === 'stream_event' &&
          event.event.type === 'text_delta'
        ) {
          if (!activeTextId) {
            textSegment += 1;
            activeTextId = `coach-text-${textSegment}`;
            writer.write({ type: 'text-start', id: activeTextId });
          }
          writer.write({
            type: 'text-delta',
            id: activeTextId,
            delta: event.event.text,
          });
          continue;
        }

        if (
          event.type === 'stream_event' &&
          event.event.type === 'reasoning_delta'
        ) {
          // Reasoning may exist for provider continuity and diagnostics, but it
          // is never a user-visible UI part. Status/progress events represent
          // the thinking state without exposing chain-of-thought.
          continue;
        }

        if (event.type === 'stream_event' && event.event.type === 'phase') {
          writer.write({
            type: 'data-coach-status',
            id: 'coach-status-current',
            data: {
              status: event.event.phase,
            },
          });
          continue;
        }

        if (event.type === 'assistant') {
          for (const block of event.message.content) {
            // Internal tool calls are part of the model retry/history chain, not
            // UI cards. In particular, a failed ask_user_question call contains
            // the invalid input and must not be normalized into an error card by
            // the client before a later retry succeeds.
            if (
              block.type !== 'tool_use' ||
              !coachAssistantBlockIsUiSurface(block)
            ) {
              continue;
            }
            closeTextSegment();
            writer.write({
              type: 'data-coach-tool',
              id: block.id,
              data: {
                toolCallId: block.id,
                name: block.name,
                input: block.input,
              },
            });
          }
          continue;
        }

        if (event.type === 'user') {
          for (const block of event.message.content) {
            if (block.type === 'tool_result') {
              writeCoachUserToolResultParts(writer, block);
            }
          }
          continue;
        }

        if (event.type === 'system' && event.subtype === 'status') {
          writer.write({
            type: 'data-coach-status',
            id: 'coach-status-current',
            data: {
              status: event.status,
              ...(typeof event.step === 'number' ? { step: event.step } : {}),
              ...(event.progress ? { progress: event.progress } : {}),
            },
          });
          continue;
        }

        if (event.type === 'system' && event.subtype === 'context_window') {
          writer.write({
            type: 'data-coach-context-window',
            id: 'coach-context-window-current',
            data: {
              step: event.step,
              maxContextTokens: event.maxContextTokens,
              reservedOutputTokens: event.reservedOutputTokens,
              inputBudgetTokens: event.inputBudgetTokens,
              usedInputTokens: event.usedInputTokens,
              remainingInputTokens: event.remainingInputTokens,
              compressionThresholdTokens: event.compressionThresholdTokens,
              usageRatio: event.usageRatio,
              estimator: event.estimator,
              compressed: event.compressed,
              compactedMessages: event.compactedMessages,
            },
          });
          continue;
        }

        if (event.type === 'tool_progress') {
          writer.write({
            type: 'data-coach-tool-progress',
            id: 'coach-tool-progress-current',
            data: {
              toolName: event.tool_name,
              status: event.status,
              ...(typeof event.ok === 'boolean' ? { ok: event.ok } : {}),
              ...(typeof event.result_count === 'number'
                ? { resultCount: event.result_count }
                : {}),
              ...(event.tool_names ? { toolNames: event.tool_names } : {}),
            },
          });
          continue;
        }

        if (isCoachBranchOpenedYield(event)) {
          writer.write({
            type: 'data-coach-branch-opened',
            id: event.branch.id,
            data: event.branch,
          });
          continue;
        }

        if (event.type === 'result' && event.is_error) {
          hasTerminalError = true;
          const errorText = event.result || 'AI Coach failed';
          // A message part first, so the failure renders inline (and matches the
          // persisted row after refresh); then the protocol-level error chunk.
          closeTextSegment();
          writer.write({
            type: COACH_TURN_ERROR_PART_TYPE,
            id: 'coach-turn-error',
            data: { code: event.error_code || 'internal', message: errorText },
          });
          writer.write({ type: 'error', errorText });
        }
      }

      if (projected) return;
      closeTextSegment();
      writer.write({ type: 'finish-step' });
      writer.write({
        type: 'finish',
        finishReason: hasTerminalError ? 'error' : 'stop',
      });
    },
  });
}

export function pipeCoachQueryYieldsToUIMessageResponse(args: {
  response: ServerResponse;
  source: AsyncIterable<CoachUiStreamYield>;
  originalMessages?: CoachUiMessage[];
}) {
  pipeUIMessageStreamToResponse({
    response: args.response,
    stream: coachQueryYieldsToUIMessageStream(args.source, {
      originalMessages: args.originalMessages,
    }),
    headers: {
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
