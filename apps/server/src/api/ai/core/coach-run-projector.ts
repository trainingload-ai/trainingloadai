import type {
  CoachActivity,
  CoachActivityEvent,
  CoachInteractionSnapshot,
  CoachRunSnapshot,
  CoachRunStatus,
} from '@shared/ai-coach-run-contract';
import type {
  CoachUiChunk,
  CoachUiMessage,
  CoachUiStreamYield,
} from './coach-ui-message-stream';
import {
  coachAssistantBlockIsUiSurface,
  coachAssistantBlockIsInternalToolUse,
} from './coach-message.util';
import { sanitizeStoredCoachMessageForClient } from './coach-history-messages';
import { COACH_RUN_PART_TYPES } from '@shared/ai-coach-run-contract';
import { sanitizeCoachPublicSummary } from './coach-public-summary';
import {
  buildCoachFailureReceipt,
  type StoredCoachFailureReceipt,
} from './coach-failure-receipt';

export function coachV1CompatibleChunk(
  chunk: CoachUiChunk,
): CoachUiChunk | null {
  if (COACH_RUN_PART_TYPES.has(chunk.type)) return null;
  if (chunk.type === 'start')
    return { type: 'start', messageId: chunk.messageId };
  return chunk;
}

export function coachSnapshotChunks(
  messageId: string,
  envelope: unknown,
): CoachUiChunk[] {
  const stored = sanitizeStoredCoachMessageForClient(
    envelope,
  ) as CoachUiMessage;
  const chunks: CoachUiChunk[] = [
    { type: 'start', messageId, messageMetadata: stored.metadata },
    { type: 'start-step' },
  ];
  let ordinal = 0;
  for (const part of stored.parts ?? []) {
    if (part.type === 'text') {
      const id = `${messageId}:replay:${ordinal++}`;
      chunks.push(
        { type: 'text-start', id },
        { type: 'text-delta', id, delta: part.text },
        { type: 'text-end', id },
      );
    } else if (part.type.startsWith('data-')) chunks.push(part as CoachUiChunk);
  }
  chunks.push(
    { type: 'finish-step' },
    { type: 'finish', finishReason: 'stop' },
  );
  return chunks;
}

/** One producer-owned projection feeds BOTH storage and the live stream. */
export class CoachRunProjector {
  readonly message: CoachUiMessage;
  readonly run: CoachRunSnapshot;
  readonly activities = new Map<string, CoachActivity>();
  pendingInteraction: CoachInteractionSnapshot | null = null;
  mutationStarted = false;
  readonly unresolvedTools = new Set<string>();
  private readonly providerHistory: Array<{
    role: 'ASSISTANT' | 'USER';
    content: string;
    message: unknown;
  }> = [];
  private readonly toolNameByCallId = new Map<string, string>();
  private textOrdinal = 0;
  private out: CoachUiChunk[] = [];
  // Physical attempts stay immutable in the private audit, even when the public
  // timeline retracts a transient failure. Never infer retries by tool name:
  // two concurrent calls to the same tool can be unrelated operations.
  private readonly activityAudit: Array<CoachActivityEvent & { at: string }> =
    [];
  private readonly deferredFailures = new Map<
    string,
    { item: CoachActivity; required: boolean }
  >();
  private terminalFailure: { code?: string; message?: string } | null = null;

  constructor(args: {
    run: CoachRunSnapshot;
    parentAttemptId?: string;
    receipt?: CoachInteractionSnapshot;
  }) {
    this.run = { ...args.run };
    this.message = {
      id: args.run.messageId,
      role: 'assistant',
      parts: [{ type: 'step-start' }],
      metadata: {
        schemaVersion: 2,
        runId: args.run.runId,
        attemptId: args.run.attemptId,
        ...(args.parentAttemptId
          ? { parentAttemptId: args.parentAttemptId }
          : {}),
      },
    };
    if (args.receipt)
      this.upsert(
        'coach-interaction',
        args.receipt.interactionId,
        args.receipt,
      );
    this.out = [];
  }

  start(): CoachUiChunk[] {
    this.out = [
      {
        type: 'start',
        messageId: this.message.id,
        messageMetadata: this.message.metadata,
      },
      { type: 'start-step' },
    ];
    for (const part of this.message.parts) {
      if (part.type === 'data-coach-interaction') this.out.push(part);
    }
    this.publishRun();
    return this.out;
  }

  private upsert<
    K extends keyof import('./coach-ui-message-stream').CoachUiDataParts,
  >(
    name: K,
    id: string,
    data: import('./coach-ui-message-stream').CoachUiDataParts[K],
  ) {
    const part = {
      type: `data-${name}`,
      id,
      data,
    } as CoachUiMessage['parts'][number];
    const index = this.message.parts.findIndex(
      (p) => p.type === part.type && 'id' in p && p.id === id,
    );
    if (index < 0) this.message.parts.push(part);
    else this.message.parts[index] = part;
    this.out.push(part as CoachUiChunk);
  }

  private publishRun() {
    this.run.revision += 1;
    this.upsert('coach-run', this.run.runId, { ...this.run });
  }

  private activity(event: CoachActivityEvent, now: string) {
    const id = `${this.run.attemptId}:${event.key}`;
    const previous = this.activities.get(id);
    if (event.toolCallId && event.toolName) {
      this.toolNameByCallId.set(event.toolCallId, event.toolName);
    }
    // Repeated status snapshots must not manufacture duplicate work.
    if (previous?.status === event.status) return;
    const terminal = !['queued', 'running', 'waiting'].includes(event.status);
    if (previous && !['queued', 'running', 'waiting'].includes(previous.status))
      return;
    this.activityAudit.push({ ...event, at: now });
    const publicSummary =
      event.kind === 'analysis'
        ? sanitizeCoachPublicSummary(event.publicSummary)
        : undefined;
    const item: CoachActivity = {
      ...previous,
      activityId: id,
      runId: this.run.runId,
      attemptId: this.run.attemptId,
      seq: previous?.seq ?? this.activities.size,
      revision: (previous?.revision ?? 0) + 1,
      kind: event.kind,
      labelKey: event.labelKey,
      status: event.status,
      ...(publicSummary ? { publicSummary } : {}),
      ...(event.toolName ? { toolName: event.toolName } : {}),
      ...(event.skillName ? { skillName: event.skillName } : {}),
      ...(event.toolCallId ? { toolCallId: event.toolCallId } : {}),
      ...(event.status === 'running' || (terminal && !previous)
        ? { startedAt: previous?.startedAt ?? now }
        : {}),
      ...(terminal ? { endedAt: now } : {}),
    };
    this.activities.set(id, item);
    if (event.status === 'failed') {
      this.deferredFailures.set(id, {
        item,
        // Permission failures and potentially applied writes must never be
        // silently dismissed merely because the model produced final text.
        required:
          event.failure?.stage === 'check_permissions' ||
          Boolean(event.mutation && previous?.startedAt),
      });
      this.upsert('coach-activity', id, {
        ...item,
        status: 'waiting',
        display: 'hidden',
      });
    } else {
      this.upsert('coach-activity', id, {
        ...item,
        ...(event.kind === 'recovery' || event.status === 'queued'
          ? { display: 'hidden' as const }
          : {}),
      });
    }
    if (event.mutation && event.toolCallId) {
      if (event.status === 'running') {
        this.mutationStarted = true;
        this.unresolvedTools.add(event.toolCallId);
      } else if (terminal) this.unresolvedTools.delete(event.toolCallId);
    }
  }

  consume(
    event: CoachUiStreamYield,
    now = new Date().toISOString(),
  ): CoachUiChunk[] {
    this.out = [];
    if (
      event.type === 'user' ||
      (event.type === 'assistant' &&
        event.message.content.some(coachAssistantBlockIsInternalToolUse))
    ) {
      this.providerHistory.push({
        role: event.type === 'user' ? 'USER' : 'ASSISTANT',
        content: '',
        message: event.message,
      });
    }
    if (event.type === 'activity')
      this.activity(event.activity, event.activity.at ?? now);
    if (event.type === 'stream_event' && event.event.type === 'text_delta') {
      const text = event.event.text;
      if (text) {
        const ordinal = this.textOrdinal++;
        const id = `${this.run.attemptId}:text:${ordinal}`;
        this.upsert('coach-text-segment', id, {
          segmentId: id,
          modelStepId: event.event.modelStepId ?? id,
          textOrdinal: ordinal,
          placement: event.event.placement ?? 'answer',
        });
        this.message.parts.push({ type: 'text', text, state: 'done' });
        this.out.push(
          { type: 'text-start', id },
          { type: 'text-delta', id, delta: text },
          { type: 'text-end', id },
        );
      }
    }
    if (event.type === 'assistant') {
      for (const block of event.message.content) {
        if (block.type !== 'tool_use' || !coachAssistantBlockIsUiSurface(block))
          continue;
        this.upsert('coach-tool', block.id, {
          toolCallId: block.id,
          name: block.name,
          input: block.input,
        });
        if (block.name === 'AskUserQuestion') {
          this.pendingInteraction = {
            interactionId: `${this.run.attemptId}:question:${block.id}`,
            runId: this.run.runId,
            questionMessageId: this.message.id,
            questionToolCallId: block.id,
            status: 'pending',
            revision: 1,
          };
          this.upsert(
            'coach-interaction',
            this.pendingInteraction.interactionId,
            this.pendingInteraction,
          );
          this.activity(
            {
              key: `question:${block.id}`,
              kind: 'question',
              status: 'waiting',
              labelKey: 'question',
              toolCallId: block.id,
            },
            now,
          );
        } else {
          this.activity(
            {
              key: `artifact:${block.id}`,
              kind: 'artifact',
              status: 'completed',
              labelKey: 'artifact',
              toolCallId: block.id,
            },
            now,
          );
        }
      }
    }
    if (event.type === 'branch')
      this.upsert('coach-branch-opened', event.branch.id, event.branch);
    if (event.type === 'system' && event.subtype === 'context_window') {
      const { type: _type, subtype: _subtype, ...data } = event;
      this.upsert('coach-context-window', 'coach-context-window-current', data);
    }
    if (event.type === 'result' && event.is_error) {
      this.terminalFailure = {
        code: event.error_code,
        message: event.result,
      };
      this.upsert('coach-turn-error', 'coach-turn-error', {
        code: event.error_code ?? 'internal',
        message: event.result,
      });
    }
    // Internal tool-result payloads and raw reasoning never enter the public projection.
    return this.out;
  }

  finish(
    status: CoachRunStatus,
    now = new Date().toISOString(),
  ): CoachUiChunk[] {
    this.out = [];
    this.run.status = status;
    this.run.endedAt = now;
    this.run.executionMs =
      this.run.previousExecutionMs +
      Math.max(0, Date.parse(now) - Date.parse(this.run.startedAt));
    this.run.retryBlocked =
      this.mutationStarted || this.unresolvedTools.size > 0;
    if (status === 'awaiting_input' && this.pendingInteraction)
      this.run.pendingInteractionId = this.pendingInteraction.interactionId;
    for (const item of this.activities.values()) {
      if (item.status !== 'running' && item.status !== 'queued') continue;
      this.activity(
        {
          key: item.activityId.slice(this.run.attemptId.length + 1),
          kind: item.kind,
          labelKey: item.labelKey,
          toolCallId: item.toolCallId,
          status:
            status === 'cancelled'
              ? 'cancelled'
              : status === 'failed'
                ? 'failed'
                : 'interrupted',
        },
        now,
      );
    }
    // Final outcome is the public boundary. A successful run does not rewrite
    // failed attempts into successes: those remain available in activityAudit
    // and providerHistory. A failed run exposes its last failing step, not a
    // stack of internal attempts. Safety-relevant failures remain visible.
    const lastFailure = [...this.deferredFailures.keys()].at(-1);
    for (const [id, { item, required }] of this.deferredFailures) {
      if (required || (status === 'failed' && id === lastFailure))
        this.upsert('coach-activity', id, {
          ...item,
          revision: item.revision + 1,
        });
    }
    this.publishRun();
    this.out.push(
      { type: 'finish-step' },
      { type: 'finish', finishReason: status === 'failed' ? 'error' : 'stop' },
    );
    return this.out;
  }

  envelope(legacyMessage?: unknown) {
    const content = this.message.parts
      .filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join('');
    const blocks = this.message.parts.flatMap((part) =>
      part.type === 'text'
        ? [{ type: 'text', text: part.text }]
        : part.type === 'data-coach-tool'
          ? [
              {
                type: 'tool_use',
                id: part.data.toolCallId,
                name: part.data.name,
                input: part.data.input,
              } as Record<string, unknown>,
            ]
          : [],
    );
    const failureReceipt: StoredCoachFailureReceipt | null =
      this.run.status === 'failed' ||
      this.run.status === 'interrupted' ||
      this.run.status === 'cancelled'
        ? buildCoachFailureReceipt({
            outcome: this.run.status,
            providerHistory: this.providerHistory,
            terminal: this.terminalFailure,
            toolNameByCallId: this.toolNameByCallId,
          })
        : null;
    return {
      content,
      message: {
        kind: 'ui_message',
        version: 2,
        ...this.message,
        providerHistory: this.providerHistory,
        activityAudit: this.activityAudit,
        ...(failureReceipt ? { failureReceipt } : {}),
        legacyMessage: legacyMessage ?? { content: blocks },
        providerReplay:
          this.run.status === 'completed' ||
          this.run.status === 'awaiting_input',
      },
    };
  }
}
