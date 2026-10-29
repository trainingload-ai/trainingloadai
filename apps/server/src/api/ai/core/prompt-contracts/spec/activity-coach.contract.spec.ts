import { describe, expect, it } from '@jest/globals';
import { SportType } from '@prisma/client';
import { resolveActivityCoachSportContext } from '../../../activity-coach-sport-context';
import {
  ACTIVITY_AI_REVIEW_PROMPT_VERSION,
  buildActivityCoachSystemPrompt,
  compileActivityCoachMessages,
  formatActivityCoachCompiledPromptLog,
  withActivityCoachPromptAddendum,
} from '../activity-coach.contract';

describe('activity-coach prompt contract', () => {
  const sportContext = resolveActivityCoachSportContext({
    sportType: SportType.UNKNOWN,
    sportDefinitionCode: 'STRENGTH_TRAINING',
  });

  it('keeps the system prompt in English and writes analysis in the requested locale', () => {
    const prompt = buildActivityCoachSystemPrompt({
      sportContext,
      lang: 'ja',
    });

    expect(prompt).toContain(
      `Prompt version: ${ACTIVITY_AI_REVIEW_PROMPT_VERSION}`,
    );
    expect(prompt).toContain(
      'Write athlete-facing prose in locale: ja (Japanese)',
    );
    expect(prompt).toContain('Trainingload.ai AI Coach');
    expect(prompt).toContain('speaking directly to your athlete');
    expect(prompt).toContain('Never refer to yourself');
    expect(prompt).toContain('Output Markdown only');
    expect(prompt).toContain('Do not use emoji');
    expect(prompt).toContain('Open with one concise coaching verdict');
    expect(prompt).toContain('Use pace.average_formatted verbatim');
    expect(prompt).toContain('# Time grounding');
    expect(prompt).toContain(
      'historical_load is a snapshot ending on temporal_context.historical_load_as_of',
    );
    expect(prompt).toContain(
      'When recency=historical, do not prescribe calendar-relative actions',
    );
    expect(prompt).toContain('STRENGTH_TRAINING');
    expect(prompt).toContain(
      'Do not output pace, distance, elevation, cadence',
    );
    expect(prompt).not.toContain('你是用户的私人运动教练');
    expect(prompt).not.toContain('请用中文撰写解读正文');
  });

  it('resolves traditional Chinese instead of collapsing every non-English locale to zh', () => {
    const prompt = buildActivityCoachSystemPrompt({
      sportContext,
      lang: 'zh-Hant-TW',
    });

    expect(prompt).toContain(
      'Write athlete-facing prose in locale: zh-hant (Traditional Chinese)',
    );
    expect(prompt).not.toContain('locale: zh (Simplified Chinese)');
  });

  it('compiles system plus user JSON and formats the constructed prompt for logs', () => {
    const messages = compileActivityCoachMessages({
      sportContext,
      unifiedInputJson: '{"sportType":"UNKNOWN"}',
      lang: 'de',
    });

    expect(messages[0]?.role).toBe('system');
    expect(messages[1]?.role).toBe('user');
    expect(messages[1]?.content).toBe('{"sportType":"UNKNOWN"}');

    const log = formatActivityCoachCompiledPromptLog({
      locale: 'de',
      activityId: 12,
      userId: 'user-1',
      messages,
    });
    expect(log).toContain('单次活动 AI 教练解读');
    expect(log).toContain('locale=de');
    expect(log).toContain('activityId=12');
    expect(log).toContain(String(messages[0]?.content));
  });

  it('appends extra instructions after the core prompt without rewriting it', () => {
    const core = buildActivityCoachSystemPrompt({
      sportContext,
      lang: 'en',
    });
    const combined = withActivityCoachPromptAddendum(
      core,
      '# Public tool addendum\nJSON only.',
    );
    expect(combined.startsWith(core)).toBe(true);
    expect(combined.slice(core.length)).toBe(
      '\n\n# Public tool addendum\nJSON only.',
    );
  });
});
