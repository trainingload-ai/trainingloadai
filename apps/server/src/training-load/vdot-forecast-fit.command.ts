/** Offline model selection and holdout evaluation. Input contains pseudonymous VDOT series only. */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  trainVdotArtifact,
  type VdotTrainingSeries,
} from '@/algorithm/vdot-forecast-training';
import { prepareVdotHistory } from '@/algorithm/vdot-forecast';

const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    output: { type: 'string' },
    'selection-start': { type: 'string' },
    'training-end': { type: 'string' },
    'calibration-end': { type: 'string' },
    'test-end': { type: 'string' },
  },
});

let audit: Record<string, unknown> | undefined;
try {
  if (Object.keys(values).length !== 6)
    throw new Error('VDOT_TRAINING_ARGUMENTS_REQUIRED');
  const series = JSON.parse(
    readFileSync(values.input!, 'utf8'),
  ) as VdotTrainingSeries[];
  if (
    !Array.isArray(series) ||
    series.some(
      (user) =>
        typeof user.id !== 'string' || !Array.isArray(user.observations),
    )
  ) {
    throw new Error('VDOT_TRAINING_INVALID_INPUT');
  }
  const observations = series.flatMap((user) => user.observations);
  const observedDates = observations.map((row) => row.date).sort();
  const eligibility: Record<string, number> = {};
  for (const user of series) {
    const status = prepareVdotHistory(
      user.observations,
      values['test-end']!,
    ).status;
    eligibility[status] = (eligibility[status] ?? 0) + 1;
  }
  audit = {
    users: series.length,
    observations: observations.length,
    firstObservation: observedDates[0] ?? null,
    lastObservation: observedDates.at(-1) ?? null,
    eligibilityAtTestEnd: eligibility,
    minimumValidationUsers: 50,
    minimumTestSamplesPerHorizon: 200,
  };
  const report = trainVdotArtifact(series, {
    selectionStart: values['selection-start']!,
    trainingEnd: values['training-end']!,
    calibrationEnd: values['calibration-end']!,
    testEnd: values['test-end']!,
  });
  writeFileSync(
    `${values.output}.report.json`,
    JSON.stringify({ ...report, audit }, null, 2),
    { mode: 0o600 },
  );
  if (report.passed)
    writeFileSync(values.output!, JSON.stringify(report.artifact, null, 2), {
      mode: 0o600,
    });
  process.stdout.write(
    JSON.stringify({
      ok: report.passed,
      code: report.passed
        ? 'VDOT_MODEL_VALIDATED'
        : 'VDOT_MODEL_VALIDATION_FAILED',
      partitions: report.partitions,
    }) + '\n',
  );
  if (!report.passed) process.exitCode = 2;
} catch (error) {
  const code =
    error instanceof Error && /^VDOT_[A-Z_]+$/.test(error.message)
      ? error.message
      : 'VDOT_TRAINING_FAILED';
  if (audit && values.output) {
    writeFileSync(
      `${values.output}.report.json`,
      JSON.stringify({ ok: false, code, audit }, null, 2),
      { mode: 0o600 },
    );
  }
  process.stderr.write(JSON.stringify({ ok: false, code }) + '\n');
  process.exitCode = 1;
}
