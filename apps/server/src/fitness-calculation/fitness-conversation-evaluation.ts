/** Offline acceptance of anonymized tool traces, not answer-keyword matching. */
export type FitnessTraceStep = {
  tool: string;
  output?: {
    kind?: string;
    status?: string;
    preparationStatus?: string;
    reasonCode?: string;
    candidates?: unknown[];
    observations?: unknown[];
    nextActions?: unknown[];
    noMetricWrite?: boolean;
  };
};
export function evaluateFitnessAssessmentTrace(trace: FitnessTraceStep[]) {
  if (trace.some((s) => /mutation_|decision_apply|threshold_set/.test(s.tool)))
    return { complete: false, reason: 'ANALYSIS_MUTATION' };
  const outcome = [...trace]
    .reverse()
    .find((s) => s.output?.kind === 'fitness_assessment_result');
  if (!outcome) return { complete: false, reason: 'NO_ASSESSMENT_OUTCOME' };
  const r = outcome.output!;
  if (r.preparationStatus === 'READY')
    return { complete: false, reason: 'CALCULATION_NOT_EXECUTED' };
  if (r.noMetricWrite !== true)
    return { complete: false, reason: 'MISSING_READ_ONLY_CONTRACT' };
  if (r.status === 'ESTIMATED')
    return {
      complete:
        /fitness[._]calculate/.test(outcome.tool) && !!r.candidates?.length,
      reason: 'ESTIMATE',
    };
  if (
    r.status === 'OBSERVATION_ONLY' &&
    r.observations?.length &&
    /fitness[._]calculate/.test(outcome.tool)
  )
    return { complete: true, reason: 'OBSERVATION' };
  return {
    complete:
      [
        'METHOD_UNAVAILABLE',
        'SCOPE_UNSUPPORTED',
        'PROTOCOL_UNCONFIRMED',
      ].includes(r.reasonCode ?? '') ||
      (!!r.reasonCode && !!r.nextActions?.length) ||
      r.status === 'WAITING_DATA',
    reason: r.reasonCode ?? r.status,
  };
}
export const anonymizedFitnessTraceCases = [
  {
    id: 'reported-stored-values-instead-of-calculation',
    trace: [
      { tool: 'metric.current', output: { kind: 'stored_metrics' } },
      { tool: 'metric.history', output: { kind: 'stored_metrics' } },
    ],
    expected: false,
  },
  {
    id: 'methods-then-generic-search-without-assessment-outcome',
    trace: [
      { tool: 'fitness.methods', output: { kind: 'method_catalog' } },
      { tool: 'metric.current', output: { kind: 'stored_metrics' } },
      { tool: 'activity.search', output: { kind: 'activity_list' } },
    ],
    expected: false,
  },
  {
    id: 'prepared-but-stopped',
    trace: [
      {
        tool: 'fitness.evidence',
        output: {
          kind: 'fitness_assessment_result',
          preparationStatus: 'READY',
          noMetricWrite: true,
        },
      },
    ],
    expected: false,
  },
  {
    id: 'ordinary-ride-protocol-question',
    trace: [
      { tool: 'fitness.methods' },
      {
        tool: 'fitness.evidence',
        output: {
          kind: 'fitness_assessment_result',
          status: 'NEEDS_INPUT',
          reasonCode: 'PROTOCOL_UNKNOWN',
          nextActions: ['ANSWER_PROTOCOL'],
          noMetricWrite: true,
        },
      },
    ],
    expected: true,
  },
  {
    id: 'computed-preview',
    trace: [
      { tool: 'fitness.methods' },
      {
        tool: 'fitness.evidence',
        output: {
          kind: 'fitness_assessment_result',
          preparationStatus: 'READY',
        },
      },
      {
        tool: 'fitness.calculate',
        output: {
          kind: 'fitness_assessment_result',
          status: 'ESTIMATED',
          candidates: [{ metric: 'CP', value: 254 }],
          noMetricWrite: true,
        },
      },
    ],
    expected: true,
  },
  ...(['METHOD_UNAVAILABLE', 'SCOPE_UNSUPPORTED'] as const).map(
    (reasonCode) => ({
      id: `terminal-${reasonCode.toLowerCase()}`,
      trace: [
        {
          tool: 'fitness.evidence',
          output: {
            kind: 'fitness_assessment_result',
            status: 'UNAVAILABLE',
            reasonCode,
            nextActions: [],
            noMetricWrite: true,
          },
        },
      ],
      expected: true,
    }),
  ),
  {
    id: 'observed-max-hr-not-a-threshold',
    trace: [
      {
        tool: 'fitness.calculate',
        output: {
          kind: 'fitness_assessment_result',
          status: 'OBSERVATION_ONLY',
          observations: [{ metric: 'observedMaxHr', value: 190 }],
          noMetricWrite: true,
        },
      },
    ],
    expected: true,
  },
] satisfies Array<{ id: string; trace: FitnessTraceStep[]; expected: boolean }>;
