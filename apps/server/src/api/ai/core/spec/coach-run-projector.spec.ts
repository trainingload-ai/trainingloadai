import { describe, it, expect } from '@jest/globals';
import {
  CoachRunProjector,
  coachSnapshotChunks,
  coachV1CompatibleChunk,
} from '../coach-run-projector';
import { parseCoachRunCommand } from '@shared/ai-coach-run-contract';
import { sanitizeStoredCoachMessageForClient } from '../coach-history-messages';
import { readUIMessageStream } from 'ai';
import type { CoachUiMessage } from '../coach-ui-message-stream';

function fixture() {
  return new CoachRunProjector({
    run: {
      runId: 'run-1',
      attemptId: 'attempt-1',
      messageId: 'message-1',
      revision: 0,
      status: 'running',
      startedAt: '2026-10-08T00:00:00.000Z',
      executionMs: 100,
      previousExecutionMs: 100,
    },
  });
}

describe('Coach run projection', () => {
  it.each(['completed', 'failed'] as const)(
    'keeps physical failures private until the final %s outcome, including replay',
    async (outcome) => {
      const p = fixture();
      const chunks = p.start();
      for (const key of ['invalid-1', 'invalid-2']) {
        const updates = p.consume({
          type: 'activity',
          activity: {
            key,
            toolCallId: key,
            toolName: 'present_training_visualization',
            kind: 'tool',
            labelKey: 'tool',
            status: 'failed',
            failure: { stage: 'validate_input', code: 'INVALID_INPUT' },
          },
        });
        expect(updates).toContainEqual(
          expect.objectContaining({
            type: 'data-coach-activity',
            data: expect.objectContaining({
              status: 'waiting',
              display: 'hidden',
            }),
          }),
        );
        chunks.push(...updates);
      }
      if (outcome === 'completed')
        chunks.push(
          ...p.consume({
            type: 'activity',
            activity: {
              key: 'valid-3',
              toolCallId: 'valid-3',
              toolName: 'present_training_visualization',
              kind: 'tool',
              labelKey: 'tool',
              status: 'completed',
            },
          }),
        );
      chunks.push(...p.finish(outcome));
      const visible = p.message.parts.filter(
        (part) =>
          part.type === 'data-coach-activity' && part.data.display !== 'hidden',
      );
      expect(visible).toHaveLength(1);
      expect(visible[0]).toMatchObject({
        data: {
          status: outcome,
          toolCallId: outcome === 'completed' ? 'valid-3' : 'invalid-2',
        },
      });
      expect(
        p.envelope().message.activityAudit.filter((e) => e.status === 'failed'),
      ).toHaveLength(2);
      const publicMessage = sanitizeStoredCoachMessageForClient(
        p.envelope().message,
      );
      expect(JSON.stringify(publicMessage)).not.toContain('activityAudit');
      expect(JSON.stringify(publicMessage)).not.toContain('INVALID_INPUT');
      let last: CoachUiMessage;
      for await (const message of readUIMessageStream<CoachUiMessage>({
        stream: new ReadableStream({
          start(controller) {
            chunks.forEach((chunk) => controller.enqueue(chunk));
            controller.close();
          },
        }),
      }))
        last = message;
      expect(last).toEqual(p.message);
      expect(publicMessage).toMatchObject(JSON.parse(JSON.stringify(last)));
    },
  );
  it('never hides final permission denials or possibly applied writes', () => {
    const p = fixture();
    p.consume({
      type: 'activity',
      activity: {
        key: 'write',
        kind: 'tool',
        labelKey: 'tool',
        toolCallId: 'write',
        mutation: true,
        status: 'running',
      },
    });
    p.consume({
      type: 'activity',
      activity: {
        key: 'write',
        kind: 'tool',
        labelKey: 'tool',
        toolCallId: 'write',
        mutation: true,
        status: 'failed',
        failure: { stage: 'execute', code: 'TIMEOUT' },
      },
    });
    p.consume({
      type: 'activity',
      activity: {
        key: 'permission',
        kind: 'tool',
        labelKey: 'tool',
        toolCallId: 'permission',
        status: 'failed',
        failure: { stage: 'check_permissions', code: 'FORBIDDEN' },
      },
    });
    p.finish('completed');
    expect(p.run.retryBlocked).toBe(true);
    const failures = p.message.parts.filter(
      (part) =>
        part.type === 'data-coach-activity' &&
        part.data.status === 'failed' &&
        part.data.display !== 'hidden',
    );
    expect(failures).toHaveLength(2);
  });
  it('persists canonical skill identity through lifecycle updates and history', () => {
    const p = fixture();
    p.start();
    const event = {
      key: 'skill:initial',
      kind: 'skill' as const,
      labelKey: 'skill',
      skillName: 'training-analytics',
    };
    p.consume({ type: 'activity', activity: { ...event, status: 'running' } });
    const chunks = p.consume({
      type: 'activity',
      activity: { ...event, status: 'completed' },
    });
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'data-coach-activity',
        data: expect.objectContaining({
          skillName: 'training-analytics',
          status: 'completed',
          revision: 2,
        }),
      }),
    );
  });
  it('downgrades the stream for v1 while retaining business cards', () => {
    const p = fixture();
    const chunks = [
      ...p.start(),
      ...p.consume({
        type: 'activity',
        activity: {
          key: 'model:1:1',
          kind: 'analysis',
          labelKey: 'analysis',
          status: 'running',
        },
      }),
      ...p.consume({
        type: 'activity',
        activity: {
          key: 'model:1:1',
          kind: 'analysis',
          labelKey: 'analysis',
          status: 'completed',
          publicSummary: {
            source: 'assistant_public_summary',
            text: '先核对训练负荷，再确定恢复安排。',
          },
        },
      }),
      ...p.consume({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'q',
              name: 'AskUserQuestion',
              input: { questions: [] },
            },
          ],
        },
      }),
      ...p.finish('awaiting_input'),
    ];
    const compatible = chunks.map(coachV1CompatibleChunk).filter(Boolean);
    expect(compatible[0]).toEqual({ type: 'start', messageId: 'message-1' });
    expect(compatible.some((chunk) => chunk.type === 'data-coach-run')).toBe(
      false,
    );
    expect(
      compatible.some((chunk) => chunk.type === 'data-coach-interaction'),
    ).toBe(false);
    expect(compatible).toContainEqual(
      expect.objectContaining({
        type: 'data-coach-tool',
        data: expect.objectContaining({ name: 'AskUserQuestion' }),
      }),
    );
  });
  it('hydrates exactly the same public message from live chunks and the database', async () => {
    const p = fixture();
    const chunks = [
      ...p.start(),
      ...p.consume({
        type: 'activity',
        activity: {
          key: 'lookup',
          kind: 'tool',
          toolCallId: 'lookup',
          toolName: 'competition.events.list',
          labelKey: 'tool',
          status: 'running',
        },
      }),
      ...p.consume({
        type: 'activity',
        activity: {
          key: 'lookup',
          kind: 'tool',
          toolCallId: 'lookup',
          toolName: 'competition.events.list',
          labelKey: 'tool',
          status: 'completed',
        },
      }),
      ...p.consume({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'lookup',
              name: 'CompetitionEvents',
              input: {
                kind: 'competition_events',
                startDate: '2026-10-01',
                endDate: '2026-12-31',
                total: 0,
                events: [],
              },
            },
          ],
        },
      }),
      ...p.consume({
        type: 'stream_event',
        event: {
          type: 'text_delta',
          text: 'Answer',
          modelStepId: 'step-1',
          placement: 'answer',
        },
      }),
      ...p.finish('completed'),
    ];
    let last: CoachUiMessage;
    for await (const message of readUIMessageStream<CoachUiMessage>({
      stream: new ReadableStream({
        start(controller) {
          chunks.forEach((chunk) => controller.enqueue(chunk));
          controller.close();
        },
      }),
    }))
      last = message;
    expect(last).toEqual(p.message);
    expect(last.parts).toContainEqual(
      expect.objectContaining({
        type: 'data-coach-tool',
        data: expect.objectContaining({
          toolCallId: 'lookup',
          name: 'CompetitionEvents',
        }),
      }),
    );
    expect(
      sanitizeStoredCoachMessageForClient(p.envelope().message),
    ).toMatchObject(JSON.parse(JSON.stringify(last)));
  });
  it('keeps distinct parallel calls in insertion order and updates full snapshots', () => {
    const p = fixture();
    for (const key of ['one', 'two'])
      p.consume({
        type: 'activity',
        activity: {
          key,
          kind: 'tool',
          labelKey: 'tool',
          status: 'queued',
          toolCallId: key,
        },
      });
    p.consume({
      type: 'activity',
      activity: {
        key: 'two',
        kind: 'tool',
        labelKey: 'tool',
        status: 'running',
        toolCallId: 'two',
      },
    });
    p.consume({
      type: 'activity',
      activity: {
        key: 'two',
        kind: 'tool',
        labelKey: 'tool',
        status: 'completed',
        toolCallId: 'two',
      },
    });
    const rows = p.message.parts.filter(
      (part) => part.type === 'data-coach-activity',
    );
    expect(rows.map((part) => part.data.toolCallId)).toEqual(['one', 'two']);
    expect(rows[1].data).toMatchObject({
      status: 'completed',
      seq: 1,
      revision: 3,
    });
    expect(
      p.consume({
        type: 'activity',
        activity: {
          key: 'two',
          kind: 'tool',
          labelKey: 'tool',
          status: 'running',
        },
      }),
    ).toEqual([]);
  });

  it('does not leak reasoning or internal tool results', () => {
    const p = fixture();
    p.consume({
      type: 'stream_event',
      event: { type: 'reasoning_delta', text: 'secret' },
    });
    p.consume({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'internal',
            content: { private: 'secret' },
          },
        ],
      },
    });
    expect(
      JSON.stringify(sanitizeStoredCoachMessageForClient(p.envelope().message)),
    ).not.toContain('secret');
  });

  it('keeps native text and explicit placement, not duplicate prose', () => {
    const p = fixture();
    p.consume({
      type: 'stream_event',
      event: {
        type: 'text_delta',
        text: 'Working',
        placement: 'activity',
        modelStepId: 's1',
      },
    });
    p.consume({
      type: 'stream_event',
      event: {
        type: 'text_delta',
        text: 'Answer',
        placement: 'answer',
        modelStepId: 's2',
      },
    });
    expect(
      p.message.parts.filter((x) => x.type === 'text').map((x) => x.text),
    ).toEqual(['Working', 'Answer']);
    expect(
      p.message.parts
        .filter((x) => x.type === 'data-coach-text-segment')
        .map((x) => x.data.textOrdinal),
    ).toEqual([0, 1]);
  });

  it('stores a pending interaction separately from request completion', () => {
    const p = fixture();
    p.consume({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'question-1',
            name: 'AskUserQuestion',
            input: { questions: [] },
          },
        ],
      },
    });
    p.finish('awaiting_input', '2026-10-08T00:00:01.000Z');
    expect(p.run).toMatchObject({
      status: 'awaiting_input',
      executionMs: 1100,
      pendingInteractionId: 'attempt-1:question:question-1',
    });
    expect(p.envelope().message.providerReplay).toBe(true);
  });

  it('retains progress-only interrupted runs and prevents unsafe retry', () => {
    const p = fixture();
    p.consume({
      type: 'activity',
      activity: {
        key: 'write',
        kind: 'tool',
        labelKey: 'tool',
        status: 'running',
        mutation: true,
        toolCallId: 'write',
      },
    });
    p.finish('interrupted', '2026-10-08T00:00:01.000Z');
    expect(p.run.retryBlocked).toBe(true);
    expect(p.unresolvedTools.has('write')).toBe(true);
    expect(p.envelope().message.providerReplay).toBe(false);
    expect(
      p.message.parts.find((x) => x.type === 'data-coach-activity')?.data
        .status,
    ).toBe('interrupted');
  });

  it('stores a sanitized failed-run receipt while keeping it private from clients', () => {
    const p = fixture();
    p.consume({
      type: 'activity',
      activity: {
        key: 'tool:weight-1',
        kind: 'tool',
        labelKey: 'tool',
        status: 'completed',
        toolCallId: 'weight-1',
        toolName: 'mutation_user_body_weight',
        mutation: true,
      },
    });
    p.consume({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'weight-1',
            content: JSON.stringify({
              kind: 'mutation_applied',
              ok: true,
              actionId: 'private-action-id',
              type: 'USER_BODY_METRIC_UPDATE',
              summary: '已记录体重：75 kg。',
              payload: {
                valueKg: 75,
                effectiveDate: '2026-10-20',
                changed: true,
              },
            }),
          },
        ],
      },
    });
    p.consume({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'draft-1',
            name: 'present_coach_plan_draft',
            input: { secret: 'raw-plan' },
          },
        ],
      },
    });
    p.consume({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'draft-1',
            content: JSON.stringify({
              error: 'private validator detail',
              code: 'PLAN_QUALITY_INVALID',
            }),
            is_error: true,
          },
        ],
      },
    });
    p.consume({
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      error_code: 'invalid_plan_draft_payload',
      result: '计划草案未能通过完整性检查。',
    });
    p.finish('failed');

    const stored = p.envelope().message;
    expect(stored.failureReceipt).toMatchObject({
      outcome: 'failed',
      completedChanges: [
        {
          summary: '已记录体重：75 kg。',
          bodyWeight: { valueKg: 75 },
        },
      ],
      planDraft: { attempts: 1, produced: false },
    });
    expect(JSON.stringify(stored.failureReceipt)).not.toContain(
      'private-action-id',
    );
    expect(
      JSON.stringify(sanitizeStoredCoachMessageForClient(stored)),
    ).not.toContain('failureReceipt');
  });

  it('replays using the same message identity without rerunning tools', () => {
    const p = fixture();
    p.start();
    p.consume({
      type: 'stream_event',
      event: { type: 'text_delta', text: 'Answer' },
    });
    p.finish('completed');
    const chunks = coachSnapshotChunks(p.message.id, p.envelope().message);
    expect(chunks[0]).toMatchObject({
      type: 'start',
      messageId: 'message-1',
      messageMetadata: { runId: 'run-1' },
    });
    expect(chunks.filter((x) => x.type === 'text-delta')).toHaveLength(1);
  });

  it('validates command identities at the trust boundary', () => {
    expect(
      parseCoachRunCommand({ kind: 'start', requestId: 'request-1' }),
    ).toEqual({ kind: 'start', requestId: 'request-1' });
    expect(
      parseCoachRunCommand({
        kind: 'retry',
        requestId: 'request-1',
        runId: 'run-1',
      }),
    ).toBeNull();
    expect(
      parseCoachRunCommand({
        kind: 'answer',
        requestId: '../bad',
        runId: 'run-1',
        submissionId: 's1',
        interactionId: 'i1',
      }),
    ).toBeNull();
  });
});
