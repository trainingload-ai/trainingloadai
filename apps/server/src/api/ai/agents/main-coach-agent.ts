import type { CoachQueryYield } from '../core/coach-query-yield';
import { streamCoachAnswer } from '../core/tool-loop-agent.runtime';
import { buildAiTool, requireSignedInUser } from '../core/tool.types';
import {
  runCoachExplainer,
  type MetricExplanationRequest,
  type ReviewExplanationEvidence,
} from './coach-explainer-agent';

export async function* runMainCoachAgent(
  args: Parameters<typeof streamCoachAnswer>[0],
  review?: ReviewExplanationEvidence,
): AsyncGenerator<CoachQueryYield, void, undefined> {
  const pendingUsage: Extract<CoachQueryYield, { type: 'model_usage' }>[] = [];
  let explanation:
    | {
        request: {
          question: string;
          scope?: MetricExplanationRequest['scope'];
        };
        result: ReturnType<typeof runCoachExplainer>;
      }
    | undefined;
  const delegateExplanation = buildAiTool<
    { question: string; scope?: MetricExplanationRequest['scope'] },
    unknown
  >({
    name: review ? 'review.explain' : 'metric.explain',
    description: review
      ? 'Explain why the saved training review made its recommendation or what changed, using the exact saved review evidence and state. Use this for explanation, not for recalculating or applying the proposal.'
      : 'Delegate a metric methodology or personal metric interpretation that needs evidence to the read-only explanation Agent. Preserve the athlete’s question, dates and scope, and use the resulting evidence and limits as delivered. Answer simple definitions directly. For a mixed request, delegate only the metric question and handle the training decision separately. Do not use for changing metrics, drawing charts or creating plans.',
    kind: 'read',
    cost: 'high',
    isReadOnly: true,
    isConcurrencySafe: false,
    applicableSkills: review ? undefined : ['metric-explainer'],
    checkPermissions: requireSignedInUser,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: review ? ['question'] : ['question', 'scope'],
      properties: {
        question: { type: 'string', minLength: 1, maxLength: 1_200 },
        ...(review
          ? {}
          : { scope: { type: 'string', enum: ['METHODOLOGY', 'ATHLETE'] } }),
      },
    },
    async execute(ctx, request) {
      const task = review
        ? { question: request.question, review }
        : request.scope
          ? { question: request.question, scope: request.scope }
          : null;
      if (!task) return { status: 'UNAVAILABLE' };
      if (!explanation) {
        explanation = {
          request,
          result: runCoachExplainer({
            request: task,
            ctx,
            tools: args.tools,
            model: args.model,
            onUsage: (event) => pendingUsage.push(event),
          }),
        };
      }
      if (
        explanation.request.question === request.question &&
        explanation.request.scope === request.scope
      ) {
        return explanation.result;
      }
      return { status: 'ALREADY_REQUESTED' };
    },
  });
  try {
    const stream = streamCoachAnswer({
      ...args,
      tools: [...args.tools, delegateExplanation],
    });
    for await (const event of stream) {
      yield* pendingUsage.splice(0);
      yield event;
    }
  } finally {
    yield* pendingUsage.splice(0);
  }
}
