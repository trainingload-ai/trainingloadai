import { describe, expect, it, jest } from '@jest/globals';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AuditRedactor,
  auditConversation,
  auditMarkdown,
  summarizeAuditPayload,
  type AuditMessage,
} from './coach-conversation-audit';
import {
  parseAuditExportOptions,
  readAuditExport,
  writeAuditExport,
} from './export-coach-conversations.command';
import type { PrismaClient } from '@prisma/client';
import { buildStoredCoachUiMessageEnvelope } from '../core/coach-history-messages';

const message = (
  sequence: number,
  content: unknown[],
  role = 'ASSISTANT',
): AuditMessage => ({ sequence, role, content: '', message: { content } });
const call = (name: string, input: unknown = {}, id = 'private-call-id') => ({
  type: 'tool_use',
  id,
  name,
  input,
});
const result = (content: unknown, is_error?: boolean) => ({
  type: 'tool_result',
  tool_use_id: 'private-call-id',
  content,
  ...(is_error === undefined ? {} : { is_error }),
});

describe('coach conversation audit', () => {
  it('reads actual persisted envelopes without double-counting mirrored UI parts', () => {
    const rows = [
      message(1, [call('integration.status')]),
      message(
        2,
        [
          result(
            JSON.stringify({
              kind: 'integration_status',
              statuses: [
                {
                  provider: 'intervals_icu',
                  connected: true,
                  settings: { exportPlannedWorkouts: false },
                },
              ],
            }),
            false,
          ),
        ],
        'USER',
      ),
      message(3, [
        call(
          'PresentCoachPlanDraft',
          { periodWeeks: 2, workouts: [{}] },
          'card-call',
        ),
      ]),
    ].map((row) => ({
      ...row,
      message: buildStoredCoachUiMessageEnvelope({
        role: row.role.toLowerCase() as 'user' | 'assistant',
        content: row.content,
        message: row.message as never,
      }),
    }));
    const audit = auditConversation(rows, new AuditRedactor());
    expect(audit.map((r) => r.delivery)).toEqual([
      'tool_chain_only',
      'tool_chain_only',
      'cards_only',
    ]);
    expect(audit.map((r) => r.tools.length)).toEqual([1, 1, 1]);
    expect(audit[1].tools[0]).toMatchObject({
      name: 'integration.status',
      outcome: 'success',
      summary: { statuses: [{ settings: { exportPlannedWorkouts: false } }] },
    });
    expect(audit[2].tools[0].summary).toMatchObject({
      periodWeeks: 2,
      workoutsCount: 1,
    });
  });

  it('supports UI-only envelopes and removes reasoning in both storage forms', () => {
    const rows = auditConversation(
      [
        {
          sequence: 1,
          role: 'ASSISTANT',
          content: '',
          message: {
            kind: 'ui_message',
            version: 1,
            parts: [
              { type: 'text', text: '已生成草案' },
              { type: 'reasoning', text: 'PRIVATE_REASONING' },
              {
                type: 'data-coach-tool',
                id: 'card',
                data: {
                  toolCallId: 'card',
                  name: 'PresentCoachPlanDraft',
                  input: { periodWeeks: 1, workouts: [{}] },
                },
              },
            ],
          },
        },
        {
          sequence: 2,
          role: 'USER',
          content: '',
          message: {
            kind: 'ui_message',
            version: 1,
            legacyMessage: null,
            parts: [
              {
                type: 'data-coach-user-tool-result',
                data: {
                  toolUseId: 'card',
                  isError: true,
                  content: { error: 'PRIVATE_ERROR' },
                },
              },
            ],
          },
        },
      ],
      new AuditRedactor(),
    );
    expect(rows[0]).toMatchObject({
      delivery: 'text_and_cards',
      omittedBlocks: 1,
      text: '已生成草案',
    });
    expect(rows[1].tools[0]).toMatchObject({
      name: 'PresentCoachPlanDraft',
      outcome: 'failure',
    });
    expect(JSON.stringify(rows)).not.toMatch(/PRIVATE_REASONING|PRIVATE_ERROR/);
  });

  it('keeps persisted turn failures visible without exporting private error text', () => {
    const rows = auditConversation(
      [
        {
          sequence: 1,
          role: 'ASSISTANT',
          content: '',
          message: {
            kind: 'ui_message',
            version: 2,
            legacyMessage: { content: [] },
            parts: [
              { type: 'step-start' },
              { type: 'data-coach-run', data: { status: 'failed' } },
              {
                type: 'data-coach-turn-error',
                data: {
                  code: 'AI_CREDIT_DEBT_OUTSTANDING',
                  message: 'PRIVATE_ACCOUNT_DETAIL',
                },
              },
            ],
          },
        },
        {
          sequence: 2,
          role: 'ASSISTANT',
          content: '',
          message: {
            kind: 'ui_message',
            version: 2,
            parts: [
              {
                type: 'data-coach-turn-error',
                data: { code: 'private_internal_code', message: 'PRIVATE' },
              },
            ],
          },
        },
        {
          sequence: 3,
          role: 'ASSISTANT',
          content: '',
          message: {
            kind: 'ui_message',
            version: 2,
            legacyMessage: { content: [] },
            parts: [
              {
                type: 'data-coach-turn-error',
                data: {
                  code: 'invalid_plan_workout_adjustment_payload',
                  message: 'PRIVATE_VALIDATION_DETAIL',
                },
              },
            ],
          },
        },
      ],
      new AuditRedactor(),
    );

    expect(rows[0]).toMatchObject({
      delivery: 'error_only',
      omittedBlocks: 0,
      turnErrors: [
        {
        code: 'other',
        summary: '未识别的内部错误',
        },
      ],
    });
    expect(rows[1].turnErrors).toEqual([
      { code: 'other', summary: '未识别的内部错误' },
    ]);
    expect(rows[2].turnErrors).toEqual([
      {
        code: 'invalid_plan_workout_adjustment_payload',
        summary: '结构化内容未通过格式校验',
      },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(
      /PRIVATE_ACCOUNT_DETAIL|PRIVATE_VALIDATION_DETAIL|private_internal_code|PRIVATE/,
    );

    const markdown = auditMarkdown({
      sessions: [{ userAlias: '匿名用户-1', messages: rows, truncated: false }],
      truncated: false,
    });
    expect(markdown).toContain('失败终态（安全错误码与可读含义）');
    expect(markdown).toContain('`other`：未识别的内部错误');
    expect(markdown).not.toContain('AI_CREDIT_DEBT_OUTSTANDING');
    expect(markdown).not.toContain('```json\n[\n  {\n    "code"');
  });

  it.each([false, true])(
    'redacts earlier prose using identifiers in later calls and receipts (envelope=%s)',
    (enveloped) => {
      const hashId = '17570000001234567890';
      const workoutId = 'private-workout-id';
      const source = [
        {
          sequence: 1,
          role: 'USER',
          content: `请看活动 ${hashId} 和 ${workoutId}`,
        },
        message(2, [call('activity.byHashId', { hashId })]),
        message(
          3,
          [
            result(
              JSON.stringify({
                receipt: { changes: [{ workoutId, after: { weekIndex: 2 } }] },
              }),
              false,
            ),
          ],
          'USER',
        ),
      ].map((row) =>
        enveloped
          ? {
              ...row,
              message: buildStoredCoachUiMessageEnvelope({
                role: row.role.toLowerCase() as 'user' | 'assistant',
                content: row.content,
                message: ('message' in row ? row.message : null) as never,
              }),
            }
          : row,
      );
      const audit = auditConversation(source, new AuditRedactor());
      expect(JSON.stringify(audit)).not.toContain(hashId);
      expect(JSON.stringify(audit)).not.toContain(workoutId);
      expect(audit[0].text).toContain(`[${audit[1].tools[0].summary.hashId}]`);
      expect(audit[2].tools[0].summary).toMatchObject({
        receipt: { changesCount: 1 },
      });
    },
  );

  it('distinguishes visible cards, internal chains and legacy unknown blanks', () => {
    const rows = auditConversation(
      [
        message(2, [
          call('PresentCoachPlanDraft', {
            periodWeeks: 12,
            workouts: [{ name: 'private title' }],
          }),
        ]),
        message(1, [call('activity_byHashId')]),
        { sequence: 3, role: 'ASSISTANT', content: '', message: null },
        message(4, [
          { type: 'text', text: '已准备草案' },
          call('CoachDecisionDraft'),
        ]),
      ],
      new AuditRedactor(),
    );
    expect(rows.map((r) => r.delivery)).toEqual([
      'tool_chain_only',
      'cards_only',
      'unknown_empty',
      'text_and_cards',
    ]);
    expect(rows[1].tools[0].summary).toEqual({
      periodWeeks: 12,
      workoutsCount: 1,
    });
    expect(rows[2].structuredAvailable).toBe(false);
    expect(rows.every((r) => r.clientRenderVerified === false)).toBe(true);
  });

  it.each([
    [result('{}', false), 'success'],
    [result('{}', true), 'failure'],
    [result('{}'), 'unknown'],
    [result('not JSON'), 'unknown'],
    [result(null), 'unknown'],
    [result('{"error":"private raw error"}'), 'failure'],
    [result('{"ok":false}', false), 'failure'],
    [result('{"truncated":true,"preview":"secret"}'), 'unknown'],
  ])(
    'preserves explicit outcome without guessing legacy success %#',
    (block, expected) => {
      const rows = auditConversation(
        [message(1, [block], 'USER'), message(2, [call('metric.current')])],
        new AuditRedactor(),
      );
      expect(rows[0].tools[0].outcome).toBe(expected);
      expect(rows[0].tools[0].name).toBe('metric.current');
      expect(rows[0].tools[0].ref).toBe(rows[1].tools[0].ref);
      expect(JSON.stringify(rows)).not.toMatch(
        /private raw error|secret|private-call-id/,
      );
    },
  );

  it('retains the user integration switches and effective permissions without credentials', () => {
    const summary = summarizeAuditPayload(
      {
        kind: 'integration_status',
        statuses: [
          {
            provider: 'intervals_icu',
            enabled: true,
            connected: true,
            connectionState: 'ACTIVE',
            accessToken: 'TOP_SECRET',
            externalAccountId: 'PRIVATE_ACCOUNT',
            settings: {
              importActivitiesAutomatically: true,
              exportActivitiesAutomatically: false,
              importPlannedWorkouts: false,
              exportPlannedWorkouts: true,
              importWellness: true,
              exportWellness: false,
              importAthleteProfile: true,
              exportAthleteProfile: false,
              apiKey: 'TOP_SECRET',
            },
            operations: {
              plannedWorkouts: {
                export: {
                  productMode: 'AUTOMATIC',
                  effectiveMode: 'UNSUPPORTED',
                  state: 'MISSING_PERMISSION',
                  requiresConnection: true,
                },
              },
            },
            sync: {
              startedAt: 'private-time',
              completedAt: null,
              lastError: 'private error TOP_SECRET',
            },
          },
        ],
      },
      new AuditRedactor(),
    );
    expect(summary).toMatchObject({
      statusesCount: 1,
      statuses: [
        {
          provider: 'intervals_icu',
          connected: true,
          settings: {
            exportPlannedWorkouts: true,
            importPlannedWorkouts: false,
          },
          operations: {
            plannedWorkouts: { export: { state: 'MISSING_PERMISSION' } },
          },
          sync: { hasStarted: true, hasCompleted: false, hasError: true },
        },
      ],
    });
    expect(JSON.stringify(summary)).not.toMatch(
      /TOP_SECRET|PRIVATE_ACCOUNT|private-time|private error/,
    );
    expect(Object.keys((summary.statuses as any[])[0].settings)).toHaveLength(
      8,
    );
  });

  it('keeps execution success distinct from business conflict or a preview', () => {
    const rows = auditConversation(
      [
        message(1, [call('coach_decision_apply')]),
        message(
          2,
          [result({ kind: 'coach_decision_apply', result: 'CONFLICT' }, false)],
          'USER',
        ),
        message(3, [
          call(
            'CoachDecisionApplied',
            {
              result: 'APPLIED',
              receipt: {
                changedWorkoutCount: 1,
                changes: [
                  {
                    workoutId: 'private-workout',
                    after: { week: 2, dayOfWeek: 3, notes: 'secret note' },
                    fields: [{ field: 'dayOfWeek', before: 1, after: 3 }],
                  },
                ],
              },
            },
            'receipt-call',
          ),
        ]),
      ],
      new AuditRedactor(),
    );
    expect(rows[1].tools[0]).toMatchObject({
      outcome: 'success',
      summary: { result: 'CONFLICT' },
    });
    expect(rows[2].tools[0].summary).toMatchObject({
      result: 'APPLIED',
      receipt: {
        changedWorkoutCount: 1,
        changes: [
          {
            after: { week: 2, dayOfWeek: 3 },
            fields: [{ field: 'dayOfWeek' }],
          },
        ],
      },
    });
    expect(JSON.stringify(rows)).not.toMatch(/private-workout|secret note/);
  });

  it('preserves FTP source/configuration, missing values and numeric changes without arbitrary strings', () => {
    const summary = summarizeAuditPayload(
      {
        metric: 'ftp',
        unit: 'W',
        manualCurrent: { value: 120 },
        estimatedCurrent: { value: 71 },
        effectiveCurrent: 71,
        effectiveSource: 'AUTO',
        autoUpdate: { supported: true, enabled: true, behavior: 'private' },
        fields: [
          { field: 'dayIndex', before: 1, after: 3 },
          { field: 'notes', before: 'secret', after: 'private' },
        ],
        items: [{ metric: 'lthr', value: null, autoUpdateEnabled: null }],
      },
      new AuditRedactor(),
    );
    expect(summary).toMatchObject({
      metric: 'ftp',
      unit: 'W',
      manualCurrent: { value: 120 },
      effectiveCurrent: 71,
      effectiveSource: 'AUTO',
      autoUpdate: { supported: true, enabled: true },
      fields: [{ field: 'dayIndex', before: 1, after: 3 }, { field: 'notes' }],
      items: [{ value: null, autoUpdateEnabled: null }],
    });
    expect(JSON.stringify(summary)).not.toMatch(/private|secret/);
  });

  it('does not cross-associate results when old tool IDs collide', () => {
    const rows = auditConversation(
      [
        message(1, [call('metric.current')]),
        message(2, [call('ProfileZones')]),
        message(3, [result('{}')], 'USER'),
      ],
      new AuditRedactor(),
    );
    expect(rows[0].tools[0].surface).toBe('internal');
    expect(rows[1].tools[0].surface).toBe('card');
    expect(rows[2].tools[0].name).toBe('unknown_tool');
  });

  it('keeps structured replies/skips recognizable but omits free-form answer values', () => {
    expect(
      summarizeAuditPayload(
        {
          kind: 'coach_question_reply',
          answers: { 'private-id': 'secret option' },
          notes: { a: 'secret note' },
        },
        new AuditRedactor(),
      ),
    ).toEqual({ kind: 'coach_question_reply', answerCount: 1 });
    expect(
      summarizeAuditPayload(
        { kind: 'coach_question_skip' },
        new AuditRedactor(),
      ),
    ).toEqual({ kind: 'coach_question_skip' });
  });

  it('omits unknown keys, unknown tool names, hidden blocks, system text and reasoning', () => {
    const rows = auditConversation(
      [
        {
          ...message(1, [
            { type: 'reasoning', text: 'HIDDEN' },
            call('secret-token-tool', {
              settings: { novelSecret: 'HIDDEN' },
              error: 'HIDDEN',
            }),
          ]),
          message: {
            content: [
              { type: 'reasoning', text: 'HIDDEN' },
              call('secret-token-tool'),
            ],
            reasoning_content: 'HIDDEN',
          },
        },
        { sequence: 2, role: 'SYSTEM', content: 'HIDDEN' },
      ],
      new AuditRedactor(),
    );
    expect(JSON.stringify(rows)).not.toMatch(/HIDDEN|secret-token-tool/);
    expect(rows[0].omittedBlocks).toBe(1);
    expect(rows[0].tools[0].name).toBe('unknown_tool');
  });

  it('marks truncated/malformed/oversized results without copying a preview', () => {
    expect(summarizeAuditPayload('{bad secret}', new AuditRedactor())).toEqual({
      detail: 'omitted',
    });
    expect(
      summarizeAuditPayload(
        { truncated: true, preview: 'secret' },
        new AuditRedactor(),
      ),
    ).toEqual({ truncated: true });
    expect(
      summarizeAuditPayload('x'.repeat(1_000_001), new AuditRedactor()),
    ).toEqual({ detail: 'omitted' });
    const summary = summarizeAuditPayload(
      { changes: Array.from({ length: 201 }, () => ({ week: 1 })) },
      new AuditRedactor(),
    );
    expect(summary).toMatchObject({
      changesCount: 201,
      changesTruncated: true,
    });
    expect(summary.changes).toHaveLength(200);
  });

  it('de-identifies prose and protects markdown fences while warning of residual privacy', () => {
    const redactor = new AuditRedactor(['Alice', 'db-user']);
    const text = redactor.text(
      'Alice db-user a@example.com +8613812345678 https://host/?token=secret Bearer abc123 api_key=supersecret sk-privatekey',
    );
    expect(text).not.toMatch(
      /Alice|db-user|example.com|13812345678|abc123|supersecret|sk-privatekey/,
    );
    const output = auditMarkdown({
      sessions: [
        {
          userAlias: '匿名用户-1',
          truncated: true,
          messages: auditConversation(
            [{ sequence: 1, role: 'USER', content: '```\n## fake\n```' }],
            redactor,
          ),
        },
      ],
      truncated: true,
    });
    expect(output).toContain('````\n```');
    expect(output).toContain('会话截断：true');
    expect(output).toContain('消息截断：true');
    expect(output).toContain('不可公开');
  });
});

describe('audit export command', () => {
  it.each(
    [
      [],
      ['--out=a', '--limit=0'],
      ['--out=a', '--limit=1001'],
      ['--out=a', '--messages-per-session=10001'],
      ['--out=a', '--limit=1.5'],
      ['--out=a', '--out=b'],
      ['--out=a', '--all'],
    ].map((argv) => [argv]),
  )('rejects missing/unbounded/ambiguous options %#', (argv) => {
    expect(() => parseAuditExportOptions(argv)).toThrow();
  });

  it('uses a read-only snapshot and explicit session/message boundaries', async () => {
    const tx = {
      $executeRaw: jest
        .fn<(sql: TemplateStringsArray) => Promise<number>>()
        .mockResolvedValue(0),
      aiCoachSession: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
          {
            userId: 'user-1',
            id: 'session-1',
            user: { name: 'Alice', email: 'a@example.com' },
          },
          {
            userId: 'user-2',
            id: 'session-2',
            user: { name: 'Bob', email: 'b@example.com' },
          },
        ]),
      },
      aiCoachMessage: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
          { sequence: 1, role: 'USER', content: 'Alice a@example.com' },
          {
            sequence: 2,
            role: 'ASSISTANT',
            content: '',
            message: buildStoredCoachUiMessageEnvelope({
              role: 'assistant',
              content: '',
              message: {
                content: [
                  {
                    type: 'tool_use',
                    id: 'card-call',
                    name: 'PresentCoachPlanDraft',
                    input: {
                      title: 'Private title',
                      periodWeeks: 1,
                      workouts: [],
                    },
                  },
                ],
              },
            }),
          },
          { sequence: 3, role: 'ASSISTANT', content: 'truncated message' },
        ]),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (fn: (client: typeof tx) => Promise<string>) => fn(tx),
      ),
    };
    const output = await readAuditExport(
      prisma as unknown as PrismaClient,
      parseAuditExportOptions([
        '--out=a',
        '--limit=1',
        '--messages-per-session=2',
      ]),
    );
    expect(tx.$executeRaw.mock.calls[0][0][0]).toBe(
      'SET TRANSACTION READ ONLY',
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'RepeatableRead' }),
    );
    expect(tx.aiCoachMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', sessionId: 'session-1' },
        take: 3,
      }),
    );
    expect(output).toContain('会话截断：true');
    expect(output).toContain('消息截断：true');
    expect(output).toContain('cards_only');
    expect(output).toContain('PresentCoachPlanDraft');
    expect(output).not.toMatch(
      /Alice|a@example.com|user-1|session-1|truncated message|Private title|card-call/,
    );
  });

  it('writes owner-only files and refuses to overwrite an existing report', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'coach-audit-test-'));
    const out = join(dir, 'audit.md');
    try {
      await writeAuditExport(out, 'first');
      expect((await stat(out)).mode & 0o777).toBe(0o600);
      await expect(writeAuditExport(out, 'second')).rejects.toThrow();
      expect(await readFile(out, 'utf8')).toBe('first');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
