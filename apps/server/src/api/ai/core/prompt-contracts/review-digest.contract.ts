import { athleteTodayFromPeriodEnd } from '../athlete-relative-day';
import { ATHLETE_FACING_COACH_VOICE_PROMPT_LINES } from './coach-voice.contract';

/**
 * 周期 Digest 合同：给运动员看的训练复盘（通知 + Coach REVIEW session）。
 *
 * Digest 使用已完成活动，以及可选的计划执行/负荷/后续训练上下文来解释窗口内
 * 发生了什么。Runtime 仍独立负责 KEEP/PROPOSE，不在这里生成改课决定。
 *
 * user 消息是紧凑 JSON。不要 pretty-print，不要截断。
 */
export const REVIEW_DIGEST_PROMPT_VERSION = 'review_digest_v4_3';

export type ReviewDigestScale = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type ReviewDigestTotals = {
  totalSessions: number;
  totalDurationSec: number;
  totalDistanceM: number;
  totalTss: number;
  totalLoad: number;
  bySport: Record<
    'RUN' | 'CYCLING' | 'SWIM' | 'UNKNOWN',
    {
      sessions: number;
      durationSec: number;
      distanceM: number;
      tss: number;
    }
  >;
};

export type ReviewDigestHighlight = {
  rank: number;
  sportType: string;
  durationSec: number | null;
  distanceM: number | null;
  tss: number | null;
  title: string | null;
  startTime: Date | string | null;
};

/** 面向叙事的精简上下文，不包含内部 id、教练事件或 Runtime 决策。 */
export type ReviewDigestCoachingContext = {
  plan: {
    title: string;
    goal: string | null;
    startDate: string | null;
    endDate: string | null;
    periodWeeks: number | null;
    currentWeekIndex: number | null;
    currentDayIndex: number | null;
  };
  reviewWindow: {
    from: string;
    through: string;
    planned: number;
    done: number;
    skipped: number;
    moved: number;
    incomplete: number;
    plannedLoad: number;
    actualLoad: number;
    extraActivities: number;
    sportBreakdown: Record<string, { workouts: number; activities: number }>;
  };
  recentDays: Array<{
    date: string;
    plannedWorkouts: Array<{
      weekIndex: number | null;
      dayIndex: number | null;
      sportType: string;
      status: string;
      name: string | null;
      plannedDurationSeconds: number | null;
      plannedSessionRpe: number | null;
      expectedLoad: number | null;
      linkedActivityCount: number;
    }>;
    activities: Array<{
      title: string | null;
      sportType: string | null;
      durationMinutes: number | null;
      distanceKm: number | null;
      load: number | null;
      sessionRpe: number | null;
      linkedToPlan: boolean;
    }>;
    pmc: {
      dailyLoad: number | null;
      ctl: number | null;
      atl: number | null;
      tsb: number | null;
    };
  }>;
  loadSnapshot: {
    ctl: number | null;
    atl: number | null;
    tsb: number | null;
    currentWeekLoad: number | null;
    previousWeekLoad: number | null;
    dailyLoadLast7d: number[];
    restDaysLast14d: number | null;
  };
  upcoming: Array<{
    date: string | null;
    weekIndex: number | null;
    dayIndex: number | null;
    sportType: string;
    status: string;
    name: string | null;
    plannedDurationSeconds: number | null;
    plannedSessionRpe: number | null;
    expectedLoad: number | null;
  }>;
  competition: {
    upcomingEvents: Array<{
      title: string;
      startDate: string;
      sportType: string;
      importance: string;
      daysFromAnchor: number;
    }>;
    activeInfluences: Array<{
      eventTitle: string;
      eventStartDate: string;
      daysFromAnchor: number;
      impactLevel: string;
      phase: string | null;
      confidence: number | null;
      reasoningSummary: string;
    }>;
  };
  dataQuality: {
    missing: string[];
    hasActivityDetails: boolean;
    hasPmcTrend: boolean;
    hasAthleteProfile: boolean;
  };
};

export function serializeReviewDigestContext(context: unknown): string {
  return JSON.stringify(context ?? null);
}

export function buildReviewDigestUserPayload(args: {
  type: ReviewDigestScale;
  periodStart: Date;
  periodEnd: Date;
  timezone: string;
  totals: ReviewDigestTotals;
  highlights: ReviewDigestHighlight[];
  coachingContext?: ReviewDigestCoachingContext | null;
}) {
  const bySport = (['RUN', 'CYCLING', 'SWIM', 'UNKNOWN'] as const)
    .map((sportType) => {
      const row = args.totals.bySport[sportType];
      if (!row || row.sessions <= 0) return null;
      return { sportType, ...row };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  return {
    scale: args.type,
    window: {
      periodStart: args.periodStart.toISOString(),
      periodEnd: args.periodEnd.toISOString(),
      timezone: args.timezone,
      inclusive: 'half_open',
      athleteToday: athleteTodayFromPeriodEnd(args.periodEnd, args.timezone),
      reviewedFrom: args.coachingContext?.reviewWindow.from ?? null,
      reviewedThrough: args.coachingContext?.reviewWindow.through ?? null,
    },
    activities: {
      totals: {
        sessions: args.totals.totalSessions,
        durationSec: args.totals.totalDurationSec,
        distanceM: args.totals.totalDistanceM,
        tss: args.totals.totalTss,
        load: args.totals.totalLoad,
      },
      bySport,
      highlights: args.highlights.map((item) => ({
        rank: item.rank,
        sportType: item.sportType,
        title: item.title,
        startTime: item.startTime
          ? new Date(item.startTime).toISOString()
          : null,
        durationSec: item.durationSec,
        distanceM: item.distanceM,
        tss: item.tss,
      })),
    },
    coaching: args.coachingContext ?? null,
  };
}

function scaleInstructions(type: ReviewDigestScale): string[] {
  if (type === 'DAILY') {
    return [
      '# Daily review contract',
      "The completed window is the reviewed day (normally yesterday relative to window.athleteToday). Upcoming workouts are athleteToday onward. Never call the reviewed activity 'today's workout' when reviewedThrough is before athleteToday.",
      'When `coaching` is present, answer: Was the reviewed day executed as planned? What did the completed session, extra activity, missed session, or planned rest mean for load/recovery? What matters when entering the next scheduled training day?',
      'With `coaching`, use exactly these four semantic sections, translating their headings into the athlete locale:',
      '1. Execution of the reviewed day',
      '2. Training response and recovery evidence',
      '3. Connection to the next training day',
      '4. Coach takeaway',
      'When `coaching` is null, do not answer plan execution or next-planned-workout questions. Review only what was recorded and supported by activity evidence.',
      'Without `coaching`, use exactly these three semantic sections, translating their headings into the athlete locale:',
      '1. Recorded activity',
      '2. Training response supported by the data',
      '3. Coach takeaway and next observation',
      'When evidence is reasonably rich, prefer roughly 350–600 Chinese characters or 180–320 English words. This is a soft range, not a target to pad: shorter is correct when the day has little or no usable evidence.',
    ];
  }
  if (type === 'WEEKLY') {
    return [
      '# Weekly review contract',
      'Treat the window as one completed training week. Evaluate consistency and the relationship among sessions, not isolated activity rankings alone.',
      'When `coaching` is present, answer: How well did execution serve the plan goal? Which sessions or deviations shaped the week? How did load and recovery evolve? What are the one or two priorities entering the next week?',
      'With `coaching`, use exactly these four semantic sections, translating their headings into the athlete locale:',
      '1. Weekly goal and execution',
      '2. Key sessions and deviations',
      '3. Load and recovery trend',
      '4. Priorities for the next week',
      'When `coaching` is null, do not assess plan completion, plan-goal alignment, or upcoming planned work. Review the recorded weekly activity pattern and supported load evidence only.',
      'Without `coaching`, use exactly these three semantic sections, translating their headings into the athlete locale:',
      '1. Recorded weekly picture',
      '2. Key activities and supported load evidence',
      '3. Coaching takeaways for the next week',
      'When evidence is reasonably rich, prefer roughly 600–1,000 Chinese characters or 320–550 English words. This is a soft range, not a target to pad: shorter is correct when weekly evidence is sparse.',
    ];
  }
  return [
    '# Monthly review contract',
    'Treat the window as one completed calendar month. Focus on accumulated consistency, execution progress toward the stated plan goal, recurring deviations, and readiness for the next block.',
    'Do not invent a named training phase or phase boundary. Use “next stage/block” only as a generic future period unless the input explicitly names a competition phase.',
    'Execution progress is not proof of physiological adaptation. Do not claim fitness improvement or adaptation from volume, completion, or load alone without comparable performance evidence.',
    'When `coaching` is present, answer: What execution progress was made toward the plan goal? What repeated training pattern mattered most? What does the accumulated load/recovery evidence support? What are the two or three priorities for the next block?',
    'With `coaching`, use exactly these four semantic sections, translating their headings into the athlete locale:',
    '1. Plan progress this month',
    '2. Consistency and key training patterns',
    '3. Accumulated load, recovery, and deviations',
    '4. Priorities for the next block',
    'When `coaching` is null, do not assess plan progress, goal alignment, or the next planned block. Review only the recorded monthly consistency, key activities, and supported load patterns.',
    'Without `coaching`, use exactly these three semantic sections, translating their headings into the athlete locale:',
    '1. Recorded monthly picture',
    '2. Consistency, key activities, and supported load patterns',
    '3. Coaching takeaways for the next month',
    'When evidence is reasonably rich, prefer roughly 900–1,500 Chinese characters or 500–850 English words. This is a soft range, not a target to pad: shorter is correct when monthly evidence is sparse.',
  ];
}

export function buildReviewDigestSystemPrompt(args: {
  type: ReviewDigestScale;
  lang: string;
  delivery?: 'markdown' | 'agent-tool';
}): string {
  const locale = args.lang?.trim() || 'en';
  const agentToolDelivery = args.delivery === 'agent-tool';
  return [
    `Prompt version: ${REVIEW_DIGEST_PROMPT_VERSION}`,
    '# Role and outcome',
    'You are Trainingload.ai AI Coach giving your athlete an evidence-grounded coaching review, not writing a generic activity report.',
    ...ATHLETE_FACING_COACH_VOICE_PROMPT_LINES,
    'The athlete should understand what happened, why it matters, and what to pay attention to next.',
    'This markdown is shown in a notification and copied into a read-only Coach REVIEW session.',
    'A separate Coach Runtime job decides whether to postpone, skip, or modify a planned workout. Do not make that decision here.',
    ...(agentToolDelivery
      ? [
          'This is a server-owned background task. Use allowed read tools only when they resolve a material evidence gap.',
          'Finish by calling coach_task_submit_result with {"markdown":"the complete review"}. Do not return the review as ordinary chat text.',
        ]
      : []),
    '',
    '# Input and time semantics',
    'The user message is compact JSON.',
    '`window.periodStart` and `window.periodEnd` are UTC instants of a half-open interval [start, end). `window.timezone` defines the athlete-local calendar boundaries.',
    '`window.athleteToday` is the athlete-local calendar date at job time. Never take the UTC calendar date of periodEnd or generatedAt as today.',
    '`window.reviewedFrom` and `window.reviewedThrough`, when present, are the explicit athlete-local dates to name in the review.',
    '`activities` contains completed activity totals and highlights. `coaching` is optional and contains plan execution, recent load evidence, upcoming workouts, and competition context.',
    '`coaching.plan.currentWeekIndex`, workout `weekIndex`, and `dayIndex` are 1-based human-facing indices. Preserve them exactly; never subtract one.',
    'When `coaching` is null, write an activity-based review and state that plan alignment or load trend cannot be assessed where relevant. Do not fill the gap with assumptions.',
    '',
    '# Evidence hierarchy',
    '1. Establish the observed fact from the JSON.',
    '2. Explain its training meaning only when the supplied evidence supports it.',
    '3. End with a concrete, proportionate next focus grounded in upcoming data when available.',
    'Prefer the plan goal and execution summary over generic activity praise. Prefer trends and repeated patterns over a single metric for weekly/monthly conclusions.',
    'Use only numbers and dates present in the JSON. Convert seconds to minutes/hours and meters to km when useful.',
    'Missing and zero are different: null or a `dataQuality.missing` entry means unavailable. Activity tss/load of 0 means unknown unless other input explicitly proves zero stress.',
    '`dataQuality.hasPmcTrend=true` only means at least two PMC points are available; judge trend strength from the supplied points and date span.',
    '`reviewWindow.actualLoad` is not complete evidence when activity load metrics are missing. Do not calculate an execution percentage or load ratio unless both numerator and denominator are valid and comparable.',
    '`loadSnapshot.currentWeekLoad` is an anchor-week snapshot, not automatically a complete week or a monthly total. Never compare it with `previousWeekLoad` unless the reviewed scale and dates make the windows comparable.',
    'Do not describe a change as significant, improving, declining, excessive, or insufficient without a supplied comparable baseline.',
    '',
    '# Writing and safety rules',
    `Write natural Markdown in locale: ${locale}.`,
    'Make section content specific to this athlete and window. Do not use filler such as “keep it up”, “stay consistent”, or generic hydration/sleep advice unless a supplied fact makes it relevant.',
    'Select the 1–3 facts that most change the coaching interpretation; do not dump every metric.',
    'For each recommendation, make the link to an observed fact clear. If evidence is thin, explicitly lower confidence and say what is missing.',
    'If no activities were recorded, say exactly that. Do not assume a planned rest day, missed training, illness, or device-sync failure.',
    'Do not diagnose injury or illness. Do not invent pace, heart rate, weather, soreness, sleep, readiness, or subjective fatigue.',
    'You may explain how the completed window connects to a supplied upcoming workout, but do not identify internal ids or instruct the athlete to postpone, skip, or edit it.',
    '',
    ...scaleInstructions(args.type),
  ].join('\n');
}

export function buildReviewDigestMessages(args: {
  type: ReviewDigestScale;
  lang: string;
  periodStart: Date;
  periodEnd: Date;
  timezone: string;
  totals: ReviewDigestTotals;
  highlights: ReviewDigestHighlight[];
  coachingContext?: ReviewDigestCoachingContext | null;
  delivery?: 'markdown' | 'agent-tool';
}): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content: buildReviewDigestSystemPrompt({
        type: args.type,
        lang: args.lang,
        delivery: args.delivery,
      }),
    },
    {
      role: 'user',
      content: serializeReviewDigestContext(
        buildReviewDigestUserPayload({
          type: args.type,
          periodStart: args.periodStart,
          periodEnd: args.periodEnd,
          timezone: args.timezone,
          totals: args.totals,
          highlights: args.highlights,
          coachingContext: args.coachingContext,
        }),
      ),
    },
  ];
}
