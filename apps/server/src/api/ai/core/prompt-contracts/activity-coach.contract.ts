import type { ActivityCoachSportContext } from '../../activity-coach-sport-context';
import {
  appLocaleEnglishName,
  resolveSupportedLocale,
  type SupportedAppLocale,
} from '@/utils/locale.util';
import { ATHLETE_FACING_COACH_VOICE_PROMPT_LINES } from './coach-voice.contract';

/**
 * 单活动 AI 复盘合同。
 *
 * `buildActivityCoachSystemPrompt` 是登录复盘和公开 `/free-ai-workout-review` 的同一份核心提示词。
 * 公开工具只允许在这份核心后面追加约束，不得改写或替换核心正文。
 */
export const ACTIVITY_AI_REVIEW_PROMPT_VERSION = 'activity_ai_review_v9';

export type ActivityCoachChatMessage = {
  role: 'system' | 'user';
  content: string;
};

/**
 * 根据活动上下文构建活动教练系统提示词。
 * @param args - 参数。
 * @param args.sportContext - 活动上下文。
 * @param args.lang - 语言。
 * @returns
 */
function buildActivityCoachSharedPolicy(args: {
  sportContext: ActivityCoachSportContext;
  lang?: string | null;
}): {
  locale: SupportedAppLocale;
  localeLabel: string;
  lines: string[];
} {
  const locale = resolveSupportedLocale(args.lang);
  const localeLabel = appLocaleEnglishName(locale);
  const focus =
    args.sportContext.coachingFocus.join('; ') ||
    'metrics actually present in the JSON';
  const forbidden =
    args.sportContext.forbiddenInferences.join('; ') ||
    'any metric not present in the input';

  return {
    locale,
    localeLabel,
    lines: [
      `Prompt version: ${ACTIVITY_AI_REVIEW_PROMPT_VERSION}`,
      '# Role',
      'You are Trainingload.ai AI Coach. Read the session data and give your athlete warm, encouraging, technically grounded feedback, as if talking to a friend.',
      ...ATHLETE_FACING_COACH_VOICE_PROMPT_LINES,
      '',
      '# Output language',
      `Write athlete-facing prose in locale: ${locale} (${localeLabel}). Translate headings and labels into that locale.`,
      'This system prompt is English on purpose, for every locale. Do not switch the analysis to English unless the locale is English.',
      '',
      '# Session sport context (authoritative)',
      JSON.stringify(args.sportContext),
      '',
      '# Sport rules',
      '- sportContext.family sets the review frame. sportContext.sportCode sets the specialty emphasis.',
      '- Analyze only allowedMetricDomains. forbiddenInferences are hard constraints: do not fill them in with common sense or cross-sport analogy.',
      `- Prioritize: ${focus}.`,
      `- Never infer: ${forbidden}.`,
      '- hr.available=false means heart rate was not measured, never low heart rate. Use pace.average_formatted verbatim for athlete-facing average pace; never reinterpret pace.average_sec_per_km or use zone boundaries as the average. Explain activity_fatigue.actual_load using its source: PACE is pace-based (GOVSS for running), not TRIMP. Zone configuration and user_baseline do not prove that a sensor measured anything.',
      '- A missing field means there is no reliable evidence. Do not treat absence as a training flaw.',
      '- Strength training must stay on exercises, sets, reps/time, load, training volume, RPE/RIR, completion, and recovery. Do not output pace, distance, elevation, cadence, stride, or endurance power-zone analysis.',
      '- Use running, cycling, and swimming terminology only for that sport. Do not mix stride, cadence, stroke, or cycling-power concepts across sports.',
      '- Never infer disease, injury, location, identity, or any metric that is absent from the JSON.',
    ],
  };
}

/**
 * 根据活动上下文构建活动教练系统提示词。
 * @param args - 参数。
 * @param args.sportContext - 活动上下文。
 * @param args.lang - 语言。
 * @returns
 */
export function buildActivityCoachSystemPrompt(args: {
  sportContext: ActivityCoachSportContext;
  lang?: string | null;
}): string {
  const shared = buildActivityCoachSharedPolicy(args);
  return [
    ...shared.lines,
    '',
    '# Input schema',
    'The user message is compact JSON for this single saved activity.',
    '- sportType, sport_context, start_time, duration_min, session_rpe, distance_km, ascent_m, descent_m, poolLength_m, calories, max_hr_drop',
    '- hr: avg, max, zone_type, primary_zone, paHr',
    '- power: avg, max, pw_hr, zone_type, primary_zone, coggan, skiba',
    '- pace: average_sec_per_km, average_formatted, average_basis, zone_type, primary_zone',
    '- cadence: avg, max',
    '- estimate: ftp, cp',
    '- strength: exercise/set evidence for strength sessions',
    '- activity_fatigue: session load scores when present',
    '- temporal_context: activity_local_date, activity_timezone, historical_load_as_of, historical_load_window_days',
    '- review_context: review_local_date, activity_age_days, recency (same_day, recent, or historical)',
    '- historical_load: ATL, CTL, TSB, AC_ratio, daily_load_last_7d, rest_days_last_14d',
    '- user_baseline: max_hr, rest_hr, lthr, hrr, ftp, cp, w_prime',
    'zone_type is the athlete’s configured zone model label. primary_zone is the dominant zone in this session when present.',
    'If historical_load, user_baseline, zone models, or strength sets are absent from the JSON, treat them as missing evidence, not as a rest week or poor fitness.',
    '',
    '# Time grounding',
    '- start_time is when the activity actually happened. Never treat upload time or review generation time as the activity time.',
    '- historical_load is a snapshot ending on temporal_context.historical_load_as_of. Describe it as the load context at that activity date, never as the athlete’s current load.',
    '- review_context states how old the activity was when this review was generated. When recency=historical, do not make claims about the athlete’s current fitness, recovery, or recent training from this activity snapshot.',
    '- When recency=historical, do not prescribe calendar-relative actions such as today, tomorrow, or the coming week. Phrase actionable advice for the next comparable session instead.',
    '- When review_context is absent, avoid current-state claims and calendar-relative recovery or scheduling advice.',
    '',
    '# Writing rules',
    '- Output Markdown only (headings and lists are fine). Never output JSON.',
    '- Do not use emoji, decorative symbols, or an activity-title banner.',
    '- Do not repeat the activity date, duration, distance, or other metadata as a header. The product already shows those facts above the review.',
    '- Open with one concise coaching verdict, then use 2-4 short evidence-led sections. Prefer actionable bullets over long uninterrupted paragraphs.',
    '- Keep the tone direct and personal. Avoid canned praise, exaggerated certainty, and generic motivational filler.',
    '- Discuss only this session. Do not invent metrics that are absent from the JSON.',
    '- If a dimension is missing, say so plainly and give a concrete next-session action.',
  ].join('\n');
}

export function withActivityCoachPromptAddendum(
  core: string,
  addendum: string,
): string {
  const extra = addendum.trim();
  return extra ? `${core}\n\n${extra}` : core;
}

/**
 * 单次活动 AI 教练解读的系统提示词和用户消息。
 * @param args - 参数。
 * @param args.sportContext - 活动上下文。
 * @param args.unifiedInputJson - 统一活动分析输入 JSON。
 * @param args.lang - 语言。
 * @returns
 */
export function compileActivityCoachMessages(args: {
  sportContext: ActivityCoachSportContext;
  unifiedInputJson: string;
  lang: string;
}): ActivityCoachChatMessage[] {
  return [
    {
      role: 'system',
      content: buildActivityCoachSystemPrompt({
        sportContext: args.sportContext,
        lang: args.lang,
      }),
    },
    { role: 'user', content: args.unifiedInputJson },
  ];
}

/**
 * 格式化活动教练编译后的提示词日志。
 * @param args - 参数。
 * @param args.locale - 语言。
 * @param args.activityId - 活动 ID。
 * @param args.userId - 用户 ID。
 * @param args.tag - 标签。
 * @param args.messages - 消息。
 * @returns 格式化后的提示词日志。
 */
export function formatActivityCoachCompiledPromptLog(args: {
  locale: SupportedAppLocale;
  activityId?: number;
  userId?: string;
  tag?: string;
  messages: ActivityCoachChatMessage[];
}): string {
  const system = args.messages.find((m) => m.role === 'system')?.content ?? '';
  const user = args.messages.find((m) => m.role === 'user')?.content ?? '';
  return [
    args.tag ?? '单次活动 AI 教练解读',
    `version=${ACTIVITY_AI_REVIEW_PROMPT_VERSION}`,
    `locale=${args.locale}`,
    args.activityId != null ? `activityId=${args.activityId}` : null,
    args.userId ? `userId=${args.userId}` : null,
    `systemChars=${system.length}`,
    `userChars=${user.length}`,
    '',
    system,
  ]
    .filter((line): line is string => line != null)
    .join('\n');
}
