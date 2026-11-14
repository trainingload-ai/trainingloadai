/** Entirely synthetic, model-facing tool fixtures. No account or database is accessed. */
export type StateScenario = {
  id: string;
  description: string;
  acceptedStates: string[];
  acceptedReadiness?: string[];
  mayAsk: boolean;
  declined?: boolean;
  feedback?: string;
  responses: Record<string, unknown>;
};

function day(today: string, offset: number) {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function buildAthleteStateScenarios(today: string): StateScenario[] {
  const metrics = (sleep: number, hrv: number) => [
    {
      type: 'SLEEP_ASLEEP_SECONDS',
      value: sleep * 3600,
      unit: 's',
      provider: 'INTERVALS_ICU',
    },
    { type: 'HRV_RMSSD_MS', value: hrv, unit: 'ms', provider: 'INTERVALS_ICU' },
  ];
  const activities = Array.from({ length: 6 }, (_, i) => ({
    hashId: `synthetic-run-${i}`,
    sportType: 'RUN',
    date: day(today, -i - 1),
    durationMin: 45,
    distanceKm: 8,
    avgPaceSecKm: 337.5,
    sessionRpe: 3,
    load: 45,
    notes:
      'Ordinary easy session completed; comparable route and conditions, no unusual difficulty.',
  }));
  const responses: Record<string, unknown> = {
    'training.data_coverage': {
      asOf: today,
      windowDays: 35,
      readyActivityCount: 20,
      pendingActivityCount: 0,
      activeImportJobs: [],
      connections: [
        {
          provider: 'INTERVALS_ICU',
          status: 'CONNECTED',
          lastSuccessfulSyncDate: today,
        },
      ],
      limitations: [],
    },
    'integration.status': {
      connections: [
        { provider: 'INTERVALS_ICU', connected: true, syncPending: false },
      ],
    },
    'time.current': { date: today, timezone: 'Asia/Shanghai' },
    'training.readiness': {
      asOf: today,
      current: { ATL: 48, CTL: 45, TSB: -3 },
      week: { currentLoad: 300, previousLoad: 295, delta: 5 },
      recentActivities: activities,
      limitations: [
        'PMC values are modeled load, not direct evidence of recovery.',
      ],
    },
    'training.weekSummary': {
      weekStart: day(today, -6),
      totalLoad: 300,
      previousWeekLoad: 295,
      activities,
    },
    'training.baseline': {
      historyDays: 42,
      sport: 'RUN',
      usualWeeklyLoad: 300,
      comparableEasyRunPaceSecondsPerKm: 338,
      usualEasyRunRpe: 3,
    },
    'activity.recent': { activities },
    'activity.search': { activities },
    'activity.series': {
      available: false,
      reason:
        'No segment series is needed for this fixture; use the attributed activity summaries.',
    },
    'pmc.range': {
      points: [
        { date: day(today, -7), ATL: 46, CTL: 44, TSB: -2 },
        { date: day(today, -1), ATL: 48, CTL: 45, TSB: -3 },
      ],
    },
    'health.summary': {
      startDate: day(today, -20),
      endDate: today,
      days: Array.from({ length: 21 }, (_, i) => ({
        date: day(today, -20 + i),
        timezone: 'Asia/Shanghai',
        metrics: metrics([7.5, 7.2, 7.8, 7.4][i % 4], [55, 58, 53, 56][i % 4]),
      })),
    },
    'metric.current': {
      metrics: [
        {
          type: 'VO2_MAX',
          value: 48,
          sport: 'RUN',
          effectiveDate: day(today, -30),
          source: 'FORMAL_SETTING',
        },
      ],
    },
    'metric.history': {
      metrics: [
        {
          type: 'VO2_MAX',
          value: 48,
          sport: 'RUN',
          effectiveDate: day(today, -30),
          source: 'FORMAL_SETTING',
        },
      ],
    },
    'profile.current': {
      timezone: 'Asia/Shanghai',
      loadSources: ['SESSION_RPE'],
      sport: 'RUN',
    },
    'memory.search': {
      items: [
        {
          category: 'CURRENT_FEEDBACK',
          eventDate: today,
          claim:
            'The athlete reports normal effort and no current recovery difficulty.',
        },
      ],
    },
    'plan.active': { activePlan: null },
    'plan.execution_context': {
      activePlan: null,
      upcomingWorkouts: [],
      recentActivities: activities,
    },
    'competition.impact.resolve': { events: [] },
  };
  const make = (
    id: string,
    description: string,
    states: string[],
  ): StateScenario => ({
    id,
    description,
    acceptedStates: states,
    mayAsk: false,
    responses: structuredClone(responses),
  });
  const stable = make(
    'stable',
    'Consistent ordinary training and recovery facts.',
    ['STABLE'],
  );
  const noWearables = make(
    'no-wearables',
    'Adequate normal training history, no sleep or HRV data.',
    ['STABLE'],
  );
  noWearables.responses['health.summary'] = {
    startDate: day(today, -20),
    endDate: today,
    days: [],
  };

  const sparse = make(
    'no-history',
    'No activity history, no connected source and no pending sync.',
    ['UNKNOWN'],
  );
  sparse.acceptedReadiness = ['INSUFFICIENT_BUT_SAFE'];
  sparse.responses['training.data_coverage'] = {
    readyActivityCount: 0,
    pendingActivityCount: 0,
    activeImportJobs: [],
    connections: [],
    limitations: ['No training history is available.'],
  };
  sparse.responses['integration.status'] = { connections: [] };
  for (const tool of [
    'training.readiness',
    'training.weekSummary',
    'training.baseline',
    'activity.recent',
    'activity.search',
    'pmc.range',
    'health.summary',
    'memory.search',
    'plan.execution_context',
  ])
    sparse.responses[tool] = {
      available: false,
      activities: [],
      days: [],
      points: [],
      items: [],
      limitations: ['No recorded history; absence is not rest.'],
    };

  const syncing = structuredClone(sparse);
  Object.assign(syncing, {
    id: 'sync-pending',
    description: 'Eight activities are confirmed to be processing.',
    acceptedReadiness: ['WAITING_FOR_SYNC'],
  });
  syncing.responses['integration.status'] = {
    connections: [
      { provider: 'INTERVALS_ICU', connected: true, syncPending: true },
    ],
  };
  syncing.responses['training.data_coverage'] = {
    readyActivityCount: 0,
    pendingActivityCount: 8,
    activeImportJobs: [{ status: 'PROCESSING', activityCount: 8 }],
    connections: [{ provider: 'INTERVALS_ICU', status: 'CONNECTED' }],
  };

  const strained = make(
    'training-strain',
    'Demand rose with completed hard sessions; no corroborated recovery failure.',
    ['STRAINED'],
  );
  const hard = activities.map((a, i) => ({
    ...a,
    sessionRpe: i < 3 ? 7 : 4,
    load: i < 3 ? 120 : 60,
    notes:
      'Planned hard effort completed as intended; no persisting recovery difficulty reported.',
  }));
  strained.responses['training.readiness'] = {
    asOf: today,
    current: { ATL: 72, CTL: 48, TSB: -24 },
    week: { currentLoad: 650, previousLoad: 300, delta: 350 },
    recentActivities: hard,
  };
  strained.responses['activity.recent'] = { activities: hard };
  strained.responses['activity.search'] = { activities: hard };
  strained.responses['plan.execution_context'] = {
    activePlan: null,
    recentActivities: hard,
  };
  strained.responses['pmc.range'] = {
    points: [{ date: today, ATL: 72, CTL: 48, TSB: -24 }],
  };
  strained.responses['training.weekSummary'] = {
    totalLoad: 650,
    previousWeekLoad: 300,
    activities: hard,
  };

  const recoveredPoorly = make(
    'recovery-difficulty',
    'Persistent difficulty despite easier days, corroborated across comparable sessions and current feedback.',
    ['UNDER_RECOVERED'],
  );
  const difficult = activities.map((a, i) => ({
    ...a,
    sessionRpe: i < 3 ? 7 : 3,
    durationMin: i < 3 ? 50 : 45,
    avgPaceSecKm: i < 3 ? 375 : 337.5,
    notes:
      i < 3
        ? 'On the same easy route in comparable conditions, pace fell from usual 338 to 375 sec/km and RPE rose from 3 to 7; difficulty persisted after two easy days.'
        : a.notes,
  }));
  recoveredPoorly.responses['activity.recent'] = { activities: difficult };
  recoveredPoorly.responses['activity.search'] = { activities: difficult };
  recoveredPoorly.responses['plan.execution_context'] = {
    activePlan: null,
    recentActivities: difficult,
  };
  recoveredPoorly.responses['training.weekSummary'] = {
    totalLoad: 260,
    previousWeekLoad: 310,
    activities: difficult,
  };
  recoveredPoorly.responses['training.readiness'] = {
    asOf: today,
    current: { ATL: 50, CTL: 46, TSB: -4 },
    week: { currentLoad: 260, previousLoad: 310 },
    recentActivities: difficult,
  };
  recoveredPoorly.responses['pmc.range'] = {
    points: [{ date: today, ATL: 50, CTL: 46, TSB: -4 }],
  };
  recoveredPoorly.responses['memory.search'] = {
    items: [
      {
        eventDate: today,
        category: 'CURRENT_FEEDBACK',
        claim:
          'Easy running still feels unusually difficult after two easy days; the pattern has persisted across three comparable sessions.',
      },
    ],
  };
  recoveredPoorly.responses['health.summary'] = {
    startDate: day(today, -20),
    endDate: today,
    days: Array.from({ length: 21 }, (_, i) => ({
      date: day(today, -20 + i),
      timezone: 'Asia/Shanghai',
      metrics:
        i < 18
          ? metrics([7.5, 7.2, 7.8, 7.4][i % 4], [55, 58, 53, 56][i % 4])
          : metrics([5, 5.3, 4.9][i - 18], [35, 33, 36][i - 18]),
    })),
  };

  const providerChanged = make(
    'different-hrv-metrics',
    'Recent rMSSD and older SDNN have different providers and cannot establish a worsening trend.',
    ['STABLE'],
  );
  providerChanged.responses['health.summary'] = {
    days: [
      {
        date: day(today, -10),
        metrics: [
          { type: 'HRV_SDNN_MS', value: 70, unit: 'ms', provider: 'GARMIN' },
        ],
      },
      {
        date: today,
        metrics: [
          {
            type: 'HRV_RMSSD_MS',
            value: 32,
            unit: 'ms',
            provider: 'INTERVALS_ICU',
          },
        ],
      },
    ],
  };

  const conflict = make(
    'conflicting-evidence',
    'Recent records disagree about comparable-session effort; no source can resolve the conflict.',
    ['UNKNOWN'],
  );
  conflict.responses['activity.recent'] = {
    activities: difficult,
    source: 'WATCH',
    note: 'Effort metadata conflicts with same-session notes; validity is unresolved.',
  };
  conflict.responses['memory.search'] = {
    items: [
      {
        eventDate: today,
        claim:
          'The same sessions felt ordinary; entered RPE values may be wrong, but this has not been verified.',
      },
    ],
  };
  conflict.responses['health.summary'] = { days: [] };
  conflict.responses['training.readiness'] = {
    recentActivities: difficult,
    limitations: [
      'Session effort records conflict with current feedback; no independent comparable result is available.',
    ],
  };

  const concern = make(
    'concrete-concern',
    'Current attributed feedback reports persisting localized pain affecting ordinary walking after stopping a session.',
    ['HIGH_CONCERN'],
  );
  concern.responses['memory.search'] = {
    items: [
      {
        eventDate: today,
        category: 'CURRENT_FEEDBACK',
        claim:
          'I stopped today because of sharp localized lower-leg pain. It still hurts when walking normally now.',
      },
    ],
  };
  concern.feedback =
    'Current attributed feedback is available in memory.search and must be considered before concluding.';

  const ambiguity = make(
    'necessary-question',
    'A current stopped-session concern lacks the fact that distinguishes ordinary tiredness from a persisting localized problem.',
    ['UNKNOWN'],
  );
  ambiguity.mayAsk = true;
  ambiguity.responses['memory.search'] = {
    items: [
      {
        eventDate: today,
        claim:
          'I stopped the latest session because something felt wrong in my leg. No further description is recorded.',
      },
    ],
  };
  ambiguity.feedback =
    'A current stopped-session concern is recorded in memory.search; read it. Ask only if essential; a bounded uncertain assessment is also permitted.';

  const declined = structuredClone(ambiguity);
  Object.assign(declined, {
    id: 'declined-question',
    description:
      'The athlete has explicitly declined clarification; finish with known facts and limitations.',
    mayAsk: false,
    declined: true,
  });
  return [
    stable,
    noWearables,
    sparse,
    syncing,
    strained,
    recoveredPoorly,
    providerChanged,
    conflict,
    concern,
    ambiguity,
    declined,
  ];
}
