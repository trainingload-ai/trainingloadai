import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generateText, jsonSchema, stepCountIs, tool } from 'ai';
import { I18nService } from 'nestjs-i18n';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { planBuilderSkill } from '@/api/ai/core/skills/planBuilder.skill';
import {
  buildCoachStreamProviderOptions,
  createCoachLanguageModel,
  getCoachModel,
  getCoachUpstreamProvider,
} from '@/api/ai/core/coach-upstream.adapter';
import {
  compactCoachPlanDraftToolParametersSchema,
  expandCoachPlanDraftInput,
} from '@/api/ai/core/tools/presentCoachPlanDraft.tool';
import { EnduranceWorkoutCodec } from '@/api/workout/codecs/endurance-workout.codec';
import { FreeformWorkoutCodec } from '@/api/workout/codecs/freeform-workout.codec';
import { StrengthWorkoutCodec } from '@/api/workout/codecs/strength-workout.codec';
import { WorkoutCodecRegistry } from '@/api/workout/workout-codec.registry';
import { WorkoutDefinitionService } from '@/api/workout/workout-definition.service';
import { WorkoutService } from '@/api/workout/workout.service';

@Module({
  providers: [
    WorkoutService,
    WorkoutDefinitionService,
    WorkoutCodecRegistry,
    EnduranceWorkoutCodec,
    StrengthWorkoutCodec,
    FreeformWorkoutCodec,
    {
      provide: I18nService,
      useValue: { t: (key: string) => key },
    },
  ],
})
class PlanTemplateCandidateCommandModule {}

// `pnpm --dir server` makes `process.cwd()` point at `apps/server/`, while this
// monorepo keeps its environment file at the repository root. Keep the command
// usable from either directory and preserve variables already exported by the
// caller.
for (const envPath of [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
]) {
  if (existsSync(envPath)) dotenv.config({ path: envPath });
}

const briefs = {
  first: `Create the official RUN_5K_FIRST candidate: a nine-week, three-runs-per-week first-5K plan for a true beginner. Write every plan title, description, workout name and workout note in English. Use time-based DSL, RPE 3-4 and a full-sentence talk test; never prescribe pace, HR, power or zones. Weeks 1-6 must remain run-walk sessions and progressively lengthen the running intervals without a sudden jump to continuous running. Weeks 7-8 must use three varied continuous easy runs, ordered shortest to longest, and week 8 must progress beyond week 7. Week 9 must taper with two short easy continuous runs before the final completion session. Consecutive weeks 1-8 must never have an identical three-session prescription. Encode the final session as exactly \`work 5km\` with walking permitted in its notes.`,
  finish: `Create the official RUN_5K_FINISH candidate: an eight-week, four-runs-per-week plan for someone who can already run continuously for 20-30 minutes. Write every plan title, description, workout name and workout note in English. Every week must contain two easy or recovery runs, one controlled steady or technique session, and one long run, except that the final long-run slot must be exactly \`work 5km\`. Build the long run through weeks 1-3, reduce it in recovery week 4, build again in weeks 5-6, taper in week 7, and finish the 5K in week 8. Consecutive weeks must never use an identical four-session prescription. Use duration plus RPE and talk-test cues because this authoring fixture has no athlete-specific pace evidence; do not invent pace, HR, power or zone targets.`,
  improve: `Create the official RUN_5K_IMPROVE candidate: an eight-week, four-runs-per-week performance plan. Write every plan title, description, workout name and workout note in English. Use day indexes 1, 3, 5 and 7, and always order the four sessions as easy aerobic, quality, easy or recovery aerobic, then long run or final 5K. The quality session alternates interval in odd weeks and tempo in even weeks; the final long-run slot must be exactly \`work 5km\`. Build the long run through weeks 1-3, reduce it in recovery week 4, build again in weeks 5-6, taper in week 7, and race in week 8. Never stack quality days. Consecutive weeks must never use an identical four-session prescription. Use duration plus RPE because this authoring fixture has no athlete pace evidence; do not invent pace, HR, power or zone targets.`,
} as const;

function validateCandidate(
  key: keyof typeof briefs,
  candidate: {
    title: string;
    description?: string;
    periodWeeks: number;
    workouts: Array<{
      weekIndex: number;
      dayIndex: number;
      name?: string;
      notes?: string;
      text: string;
    }>;
  },
) {
  const expectedWeeks = key === 'first' ? 9 : 8;
  const expectedFrequency = key === 'first' ? 3 : 4;
  const issues: string[] = [];
  let previousFirstWeekSignature: string | null = null;
  let previousFirstContinuousMax: number | null = null;
  let previousFinishWeekSignature: string | null = null;
  let previousFinishLongMinutes: number | null = null;
  let previousImproveWeekSignature: string | null = null;
  let previousImproveLongMinutes: number | null = null;
  if (candidate.periodWeeks !== expectedWeeks)
    issues.push(`periodWeeks must be ${expectedWeeks}`);
  if (candidate.title.trim().length < 12) issues.push('title is too generic');
  if (
    (candidate.description ?? '').split(/[.!?。！？]/).filter(Boolean).length <
    2
  )
    issues.push('description must contain at least two sentences');
  for (let week = 1; week <= expectedWeeks; week += 1) {
    const sessions = candidate.workouts.filter(
      (workout) => workout.weekIndex === week,
    );
    if (sessions.length !== expectedFrequency)
      issues.push(`week ${week} must have ${expectedFrequency} sessions`);
    if (
      new Set(sessions.map((workout) => workout.dayIndex)).size !==
      sessions.length
    )
      issues.push(`week ${week} contains duplicate days`);
    if (
      key === 'first' &&
      week >= 7 &&
      week <= 8 &&
      new Set(sessions.map((workout) => workout.text.trim())).size < 2
    ) {
      issues.push(
        `week ${week} must vary its continuous-running prescriptions`,
      );
    }
    if (key === 'first' && week <= 6) {
      if (
        sessions.some((workout) => !/\brepeat\s+\d+\s*\{/i.test(workout.text))
      ) {
        issues.push(`week ${week} must remain in the run-walk phase`);
      }
    }
    if (key === 'first' && week >= 7 && week <= 8) {
      if (
        sessions.some(
          (workout) =>
            /\brepeat\b/i.test(workout.text) ||
            !/\bwork\s+\d+(?:\.\d+)?m\b/i.test(workout.text),
        )
      ) {
        issues.push(`week ${week} must use continuous duration runs`);
      }
      const longestMinutes = Math.max(
        ...sessions.map((workout) =>
          Number(workout.text.match(/\bwork\s+(\d+(?:\.\d+)?)m\b/i)?.[1] ?? 0),
        ),
      );
      if (
        previousFirstContinuousMax != null &&
        longestMinutes <= previousFirstContinuousMax
      ) {
        issues.push(`week ${week} longest run must progress from week 7`);
      }
      previousFirstContinuousMax = longestMinutes;
    }
    if (key === 'first' && week <= 8) {
      const signature = sessions
        .sort((left, right) => left.dayIndex - right.dayIndex)
        .map((workout) => workout.text.trim())
        .join('\n---\n');
      if (signature === previousFirstWeekSignature) {
        issues.push(`week ${week} must progress from the preceding week`);
      }
      previousFirstWeekSignature = signature;
    }
    if (key === 'finish') {
      const ordered = [...sessions].sort(
        (left, right) => left.dayIndex - right.dayIndex,
      );
      const signature = ordered
        .map((workout) => workout.text.trim())
        .join('\n---\n');
      if (signature === previousFinishWeekSignature) {
        issues.push(`week ${week} must progress from the preceding week`);
      }
      previousFinishWeekSignature = signature;

      const easyCount = ordered.filter(
        (workout) =>
          /easy|recovery/i.test(workout.name ?? '') &&
          !/long|5k|completion|steady|technique/i.test(workout.name ?? ''),
      ).length;
      const steadyCount = ordered.filter((workout) =>
        /steady|technique/i.test(workout.name ?? ''),
      ).length;
      const longCount = ordered.filter((workout) =>
        week === 8
          ? /5k|completion|final/i.test(workout.name ?? '')
          : /long/i.test(workout.name ?? ''),
      ).length;
      if (easyCount < 2 || steadyCount !== 1 || longCount !== 1) {
        issues.push(
          `week ${week} must contain two easy runs, one steady/technique session and one ${week === 8 ? '5K' : 'long run'}`,
        );
      }

      if (week <= 7) {
        const longSession = ordered.find((workout) =>
          /long/i.test(workout.name ?? ''),
        );
        const longMinutes = Number(
          longSession?.text.match(/\bwork\s+(\d+(?:\.\d+)?)m\b/i)?.[1] ?? 0,
        );
        if (!longMinutes) {
          issues.push(`week ${week} long run must use a duration prescription`);
        } else if (previousFinishLongMinutes != null) {
          const shouldReduce = week === 4 || week === 7;
          if (
            (shouldReduce && longMinutes >= previousFinishLongMinutes) ||
            (!shouldReduce && longMinutes <= previousFinishLongMinutes)
          ) {
            issues.push(
              `week ${week} long run must ${shouldReduce ? 'reduce' : 'progress'} from week ${week - 1}`,
            );
          }
        }
        previousFinishLongMinutes = longMinutes;
      }
    }
    if (key === 'improve') {
      const qualityDays = sessions
        .filter((workout) =>
          /interval|tempo|threshold|间歇|节奏/i.test(
            `${workout.name} ${workout.notes}`,
          ),
        )
        .map((workout) => workout.dayIndex)
        .sort((a, b) => a - b);
      if (
        qualityDays.length > 2 ||
        qualityDays.some(
          (day, index) => index > 0 && day - qualityDays[index - 1] === 1,
        )
      ) {
        issues.push(`week ${week} has adjacent or excessive quality sessions`);
      }

      const ordered = [...sessions].sort(
        (left, right) => left.dayIndex - right.dayIndex,
      );
      const signature = ordered
        .map((workout) => workout.text.trim())
        .join('\n---\n');
      if (signature === previousImproveWeekSignature) {
        issues.push(`week ${week} must progress from the preceding week`);
      }
      previousImproveWeekSignature = signature;

      const easyCount = ordered.filter(
        (workout) =>
          /easy|recovery/i.test(workout.name ?? '') &&
          !/long|5k|final|interval|tempo|threshold/i.test(workout.name ?? ''),
      ).length;
      const qualitySessions = ordered.filter((workout) =>
        /interval|tempo|threshold/i.test(workout.name ?? ''),
      );
      const longSessions = ordered.filter((workout) =>
        week === 8
          ? /5k|final|completion/i.test(workout.name ?? '')
          : /long/i.test(workout.name ?? ''),
      );
      if (
        easyCount < 2 ||
        qualitySessions.length !== 1 ||
        longSessions.length !== 1
      ) {
        issues.push(
          `week ${week} must contain two easy runs, one quality session and one ${week === 8 ? '5K race' : 'long run'}`,
        );
      }
      const expectedQuality = week % 2 === 1 ? /interval/i : /tempo/i;
      if (
        qualitySessions[0] &&
        !expectedQuality.test(qualitySessions[0].name ?? '')
      ) {
        issues.push(
          `week ${week} quality session must be ${week % 2 === 1 ? 'interval' : 'tempo'}`,
        );
      }
      if (
        qualitySessions[0] &&
        longSessions[0] &&
        !ordered
          .slice(
            Math.min(
              ordered.indexOf(qualitySessions[0]),
              ordered.indexOf(longSessions[0]),
            ) + 1,
            Math.max(
              ordered.indexOf(qualitySessions[0]),
              ordered.indexOf(longSessions[0]),
            ),
          )
          .some(
            (workout) =>
              /easy|recovery/i.test(workout.name ?? '') &&
              !/long|5k|final|interval|tempo|threshold/i.test(
                workout.name ?? '',
              ),
          )
      ) {
        issues.push(`week ${week} needs an easy day between quality and long`);
      }

      if (week <= 7) {
        const longMinutes = Number(
          longSessions[0]?.text.match(/\bwork\s+(\d+(?:\.\d+)?)m\b/i)?.[1] ?? 0,
        );
        if (!longMinutes) {
          issues.push(`week ${week} long run must use a duration prescription`);
        } else if (previousImproveLongMinutes != null) {
          const shouldReduce = week === 4 || week === 7;
          if (
            (shouldReduce && longMinutes >= previousImproveLongMinutes) ||
            (!shouldReduce && longMinutes <= previousImproveLongMinutes)
          ) {
            issues.push(
              `week ${week} long run must ${shouldReduce ? 'reduce' : 'progress'} from week ${week - 1}`,
            );
          }
        }
        previousImproveLongMinutes = longMinutes;
      }
    }
  }
  for (const [index, workout] of candidate.workouts.entries()) {
    if ((workout.name ?? '').trim().length < 8)
      issues.push(`workout ${index + 1} name is too generic`);
    if ((workout.notes ?? '').trim().length < 30)
      issues.push(`workout ${index + 1} notes are incomplete`);
    if (
      /[\u3400-\u9fff\u3040-\u30ff]/u.test(
        `${workout.name ?? ''} ${workout.notes ?? ''}`,
      )
    ) {
      issues.push(`workout ${index + 1} copy must be in English`);
    }
    if (
      (key === 'first' || key === 'finish' || key === 'improve') &&
      /\b(?:pace|hr|power|cadence)\b|\bz\d\b/i.test(workout.text)
    ) {
      issues.push(
        `workout ${index + 1} contains a forbidden numeric intensity target`,
      );
    }
  }
  if (
    /[\u3400-\u9fff\u3040-\u30ff]/u.test(
      `${candidate.title} ${candidate.description ?? ''}`,
    )
  ) {
    issues.push('plan title and description must be in English');
  }
  const orderedSessions = [...candidate.workouts].sort(
    (left, right) =>
      left.weekIndex - right.weekIndex || left.dayIndex - right.dayIndex,
  );
  const finalSession = orderedSessions[orderedSessions.length - 1];
  if (!finalSession || !/\bwork\s+5(?:\.0)?km\b/i.test(finalSession.text)) {
    issues.push('final 5K session must contain exactly `work 5km`');
  }
  if (key === 'first') {
    const taperSessions = orderedSessions.filter(
      (workout) => workout.weekIndex === 9 && workout !== finalSession,
    );
    if (
      taperSessions.length !== 2 ||
      taperSessions.some(
        (workout) =>
          /\brepeat\b/i.test(workout.text) ||
          !/\bwork\s+\d+(?:\.\d+)?m\b/i.test(workout.text),
      )
    ) {
      issues.push('week 9 must start with two short continuous taper runs');
    }
  }
  return issues;
}

async function main() {
  const requested =
    process.argv.find((arg) => arg.startsWith('--template='))?.split('=')[1] ??
    'first';
  if (!(requested in briefs)) {
    throw new Error(
      'Use --template=first, --template=finish, or --template=improve',
    );
  }
  const key = requested as keyof typeof briefs;
  const outputArg = process.argv
    .find((arg) => arg.startsWith('--output='))
    ?.slice('--output='.length);
  const revalidateArg = process.argv
    .find((arg) => arg.startsWith('--revalidate='))
    ?.slice('--revalidate='.length);
  const outputPath = resolve(
    outputArg || `/tmp/trainingload-${key}-5k-candidate.json`,
  );
  const app = await NestFactory.createApplicationContext(
    PlanTemplateCandidateCommandModule,
    { logger: false },
  );
  const definitions = app.get(WorkoutDefinitionService);
  const canonicalizeCandidate = (raw: Record<string, unknown>) => {
    const rawWorkouts = Array.isArray(raw.workouts)
      ? raw.workouts.map((workout) => {
          if (!workout || typeof workout !== 'object') return workout;
          const { definition: _definition, ...source } = workout as Record<
            string,
            unknown
          >;
          return source;
        })
      : raw.workouts;
    const expanded = expandCoachPlanDraftInput({
      ...raw,
      workouts: rawWorkouts,
    });
    if (expanded.ok === false) {
      return { candidate: null, issues: [expanded.error] };
    }
    try {
      const workouts = expanded.data.workouts.map((workout) => {
        const resolved = definitions.resolve({
          kind: workout.structureKind ?? 'ENDURANCE',
          version: 1,
          source: 'TEXT',
          text: workout.text,
        });
        return {
          ...workout,
          text: resolved.text,
          definition: {
            kind: resolved.kind,
            version: 1 as const,
            source: 'STRUCTURE' as const,
            structure: resolved.structure,
          },
        };
      });
      const candidate = {
        ...expanded.data,
        workouts,
      } as unknown as Record<string, unknown>;
      return {
        candidate,
        issues: validateCandidate(key, { ...expanded.data, workouts }),
      };
    } catch (error) {
      return {
        candidate: null,
        issues: [
          `Workout DSL/structure validation failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ],
      };
    }
  };

  if (revalidateArg) {
    const sourcePath = resolve(revalidateArg);
    const source = JSON.parse(await readFile(sourcePath, 'utf8')) as Record<
      string,
      unknown
    >;
    const rawCandidate =
      source.candidate && typeof source.candidate === 'object'
        ? (source.candidate as Record<string, unknown>)
        : source;
    const checked = canonicalizeCandidate(rawCandidate);
    if (!checked.candidate || checked.issues.length > 0) {
      throw new Error(
        `Saved candidate still fails hard rules:\n- ${checked.issues.join('\n- ')}`,
      );
    }
    await writeFile(
      outputPath,
      `${JSON.stringify(
        {
          generatedAt:
            typeof source.generatedAt === 'string'
              ? source.generatedAt
              : new Date().toISOString(),
          revalidatedAt: new Date().toISOString(),
          model:
            typeof source.model === 'string' ? source.model : getCoachModel(),
          template: key,
          promptContract:
            typeof source.promptContract === 'string'
              ? source.promptContract
              : 'plan-builder/current',
          candidate: checked.candidate,
          ...(source.usage ? { usage: source.usage } : {}),
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    process.stdout.write(`${outputPath}\n`);
    return;
  }

  let acceptedCandidate: Record<string, unknown> | null = null;
  let lastRejectedCandidate: Record<string, unknown> | null = null;
  let lastIssues: string[] = [];
  const provider = getCoachUpstreamProvider();
  const result = await generateText({
    model: createCoachLanguageModel({ thinking: false }),
    providerOptions: buildCoachStreamProviderOptions({
      thinking: false,
      provider,
    }),
    system: planBuilderSkill.prompt,
    prompt: `${briefs[key]}\n\nThis is offline editorial authoring. Do not ask questions and do not claim the plan is saved. Call present_coach_plan_draft with the complete candidate. Every workout needs a descriptive athlete-facing name of at least two meaningful words; do not use bare names such as Run, Easy Run, Long Run, Workout 1, or 5K. If the tool rejects the candidate, correct every reported issue and call it once more with the complete revised candidate.`,
    temperature: 0.25,
    stopWhen: [() => acceptedCandidate !== null, stepCountIs(2)],
    tools: {
      present_coach_plan_draft: tool({
        description:
          'Validate and return the complete official plan candidate for offline review.',
        inputSchema: jsonSchema(compactCoachPlanDraftToolParametersSchema),
        execute: async (input) => {
          const checked = canonicalizeCandidate(
            input as Record<string, unknown>,
          );
          lastIssues = checked.issues;
          if (!checked.candidate || lastIssues.length > 0) {
            if (checked.candidate) lastRejectedCandidate = checked.candidate;
            return { accepted: false, issues: lastIssues };
          }
          acceptedCandidate = checked.candidate;
          return { accepted: true, issues: [] };
        },
      }),
    },
    toolChoice: { type: 'tool', toolName: 'present_coach_plan_draft' },
  });
  if (!acceptedCandidate) {
    if (lastRejectedCandidate) {
      const rejectedPath = `${outputPath}.rejected.json`;
      await writeFile(
        rejectedPath,
        `${JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            model: getCoachModel(),
            template: key,
            promptContract: 'plan-builder/current',
            issues: lastIssues,
            candidate: lastRejectedCandidate,
            usage: result.usage,
          },
          null,
          2,
        )}\n`,
        'utf8',
      );
      process.stderr.write(`Rejected candidate: ${rejectedPath}\n`);
    }
    throw new Error(
      lastIssues.length > 0
        ? `Candidate failed hard rules after one repair:\n- ${lastIssues.join('\n- ')}`
        : `Model ${getCoachModel()} did not return a plan candidate`,
    );
  }
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        model: getCoachModel(),
        template: key,
        promptContract: 'plan-builder/current',
        candidate: acceptedCandidate,
        usage: result.usage,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  process.stdout.write(`${outputPath}\n`);
  await app.close();
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
