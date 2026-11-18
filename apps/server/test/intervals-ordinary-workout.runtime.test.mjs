import assert from 'node:assert/strict';
import test from 'node:test';
import { Logger } from '@nestjs/common';
import { Encoder, Profile } from '@garmin/fitsdk';
import { WorkoutService } from '../src/api/workout/workout.service.ts';
import { IntervalsIcuPlanSyncService } from '../src/api/intervals-icu/intervals-icu-plan-sync.service.ts';

Logger.overrideLogger(false);

function fitFile(withStep) {
  const encoder = new Encoder();
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.FILE_ID,
    type: 'workout',
    manufacturer: 'development',
    product: 1,
  });
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.WORKOUT,
    sport: 'running',
    numValidSteps: withStep ? 1 : 0,
  });
  if (withStep)
    encoder.writeMesg({
      mesgNum: Profile.MesgNum.WORKOUT_STEP,
      messageIndex: 0,
      durationType: 'time',
      durationValue: 60000,
      targetType: 'open',
      intensity: 'active',
    });
  return Buffer.from(encoder.close());
}

function parser() {
  const service = Object.create(IntervalsIcuPlanSyncService.prototype);
  service.workoutService = new WorkoutService({ t: (key) => key });
  service.sportCatalog = {
    fromProvider: async () => ({ sport: { code: 'ROAD_RUNNING' } }),
  };
  return (fit) =>
    service.parseRemoteWorkout({
      id: 'synthetic',
      category: 'WORKOUT',
      type: 'Run',
      name: 'Ordinary run',
      moving_time: 1800,
      start_date_local: '2026-07-06',
      workout_doc: { steps: [] },
      workout_file_base64: fit.toString('base64'),
    });
}

test('a valid empty FIT retains an ordinary calendar prescription', async () => {
  const parsed = await parser()(fitFile(false));
  assert.equal(parsed.structureKind, 'FREEFORM');
  assert.equal(parsed.plannedDurationSeconds, 1800);
  assert.deepEqual(parsed.blocks, []);
});

test('a CRC-corrupted FIT is rejected instead of downgraded to ordinary', async () => {
  const fit = fitFile(false);
  fit[fit.length - 1] ^= 1;
  await assert.rejects(parser()(fit));
});

test('an independently encoded structured FIT still retains its real duration', async () => {
  const parsed = await parser()(fitFile(true));
  assert.equal(parsed.structureKind, 'ENDURANCE');
  assert.equal(parsed.blocks[0].steps[0].duration, 60);
});
