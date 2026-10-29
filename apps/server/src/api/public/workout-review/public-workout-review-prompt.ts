import { resolveActivityCoachSportContext } from '@/api/ai/activity-coach-sport-context';
import {
  buildActivityCoachSystemPrompt,
  formatActivityCoachCompiledPromptLog,
  withActivityCoachPromptAddendum,
  type ActivityCoachChatMessage,
} from '@/api/ai/core/prompt-contracts/activity-coach.contract';
import { resolveSupportedLocale } from '@/utils/locale.util';
import type { PublicReviewEvidence } from './public-review-artifacts';

const PUBLIC_REVIEW_RESULT_SHAPE = `{
  "schemaVersion":"1.0", "language":"requested locale", "sport":"string",
  "verdict":"string", "overview":"2-4 short plain-text paragraphs", "workoutType":{"label":"string","rationale":"string"},
  "keyFindings":[{"title":"string","evidence":"string","interpretation":"string"}],
  "intensityAssessment":"string", "recoverySuggestion":"string",
  "nextWorkoutSuggestion":"string", "limitations":["string"], "disclaimer":"string"
}`;

function buildPublicActivityCoachAddendum(args: {
  maxCompletionTokens?: number;
  targetCompletionTokens?: number;
  delivery?: 'json' | 'agent-tool';
}): string {
  const hasTokenCap =
    args.maxCompletionTokens != null && args.targetCompletionTokens != null;
  return [
    '# Public tool addendum',
    'The user message is an anonymous FIT/GPX/TCX evidence envelope, not the saved-activity unified JSON above.',
    'Its keys are language, sport, summary, laps, userContext, dataAvailability, and derived.',
    'userContext values are visitor-supplied and unverified. dataAvailability and derived are already computed; do not recompute hidden streams.',
    'Unified fields that do not appear (historical_load, zone models, strength sets, saved baselines) are simply missing.',
    '',
    'Override the Markdown writing rule for this request only:',
    args.delivery === 'agent-tool'
      ? 'Submit one complete result object through coach_task_submit_result. Do not return it as chat text. Never expose JSON field names or paths.'
      : 'Reply with one complete JSON object. Do not use Markdown. Never expose JSON field names or paths.',
    hasTokenCap
      ? `The complete JSON must match this shape, with 2-5 keyFindings, and stay below approximately ${args.targetCompletionTokens} tokens:`
      : 'The complete JSON must match this shape, with 2-5 keyFindings:',
    PUBLIC_REVIEW_RESULT_SHAPE,
    hasTokenCap
      ? `Write overview as 2-4 concise plain-text paragraphs. The API hard limit is ${args.maxCompletionTokens} completion tokens; finish within approximately ${args.targetCompletionTokens} tokens.`
      : 'Write overview as 2-4 concise plain-text paragraphs.',
    'Always reserve enough space to close every string, array, and object. If space is running low, shorten explanations or use fewer key findings instead of returning truncated JSON.',
    'For RUN, render speed as pace in mm:ss/km; for other sports render speed in km/h. Convert durations to readable minutes or hh:mm:ss; never show m/s.',
    'Do not characterize intensity merely because whole-session average heart rate is below lactate-threshold heart rate: use the supplied threshold exposure percentages/durations or meaningful ordered segments.',
    'Do not cherry-pick arbitrary laps only because they are above or below the overall mean; discuss consistency, progression, fade, or interval structure only when the evidence supports it.',
    'Every finding must cite an actual aggregate or derived value.',
    'The disclaimer must state that this is training-data interpretation, not medical diagnosis or individualized medical advice.',
  ].join('\n');
}

export function compilePublicActivityCoachMessages(args: {
  evidence: PublicReviewEvidence;
  maxCompletionTokens?: number;
  targetCompletionTokens?: number;
  repair?: { reason: string; invalidOutput: string };
  delivery?: 'json' | 'agent-tool';
}): ActivityCoachChatMessage[] {
  const sportContext = resolveActivityCoachSportContext({
    sportType: args.evidence.sport,
  });
  const core = buildActivityCoachSystemPrompt({
    sportContext,
    lang: args.evidence.language,
  });
  const system = withActivityCoachPromptAddendum(
    core,
    buildPublicActivityCoachAddendum({
      maxCompletionTokens: args.maxCompletionTokens,
      targetCompletionTokens: args.targetCompletionTokens,
      delivery: args.delivery,
    }),
  );

  const evidenceJson = JSON.stringify(args.evidence);
  const deliveryVerb =
    args.delivery === 'agent-tool' ? 'Prepare and submit' : 'Return';
  const tokenHint =
    args.targetCompletionTokens == null
      ? `${deliveryVerb} one complete JSON object. Prioritize valid, fully closed JSON over detail.`
      : `${deliveryVerb} one complete JSON object below approximately ${args.targetCompletionTokens} tokens. Prioritize valid, fully closed JSON over detail.`;
  const user = args.repair
    ? `The previous JSON failed schema validation for this reason: ${args.repair.reason}. Repair it once; do not add facts. ${tokenHint}\n${PUBLIC_REVIEW_RESULT_SHAPE}\nInvalid output:\n${args.repair.invalidOutput.slice(0, 8_000)}\nEvidence:\n${evidenceJson}`
    : `Return this exact shape with 2-5 keyFindings. ${tokenHint} Do not truncate.\n${PUBLIC_REVIEW_RESULT_SHAPE}\nEvidence:\n${evidenceJson}`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function formatPublicActivityCoachPromptLog(args: {
  evidence: PublicReviewEvidence;
  messages: ActivityCoachChatMessage[];
}): string {
  return formatActivityCoachCompiledPromptLog({
    tag: '[公开AI复盘] compiled prompt',
    locale: resolveSupportedLocale(args.evidence.language),
    messages: args.messages,
  });
}
