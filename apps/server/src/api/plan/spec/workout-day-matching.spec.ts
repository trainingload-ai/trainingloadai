import { matchWorkoutDay } from '../application/workout-day-matching';

describe('workout day matching', () => {
  it('keeps close alternatives unresolved instead of choosing by plan or ordering', () => {
    expect(
      matchWorkoutDay(
        [
          {
            id: 1,
            sportType: 'RUN',
            durationSeconds: 1800,
            distanceMeters: null,
          },
        ],
        [
          {
            id: 'plan-course',
            sportType: 'RUN',
            durationSeconds: 1860,
            distanceMeters: null,
          },
          {
            id: 'independent',
            sportType: 'RUN',
            durationSeconds: 1800,
            distanceMeters: null,
          },
        ],
      ),
    ).toEqual({
      matches: [],
      reviews: [
        {
          activityId: 1,
          reason: 'AMBIGUOUS',
          candidateWorkoutIds: ['independent', 'plan-course'],
        },
      ],
    });
  });

  it('does not discard an unknown prescription to manufacture a unique match', () => {
    expect(
      matchWorkoutDay(
        [
          {
            id: 1,
            sportType: 'RUN',
            durationSeconds: 1800,
            distanceMeters: null,
          },
        ],
        [
          {
            id: 'known',
            sportType: 'RUN',
            durationSeconds: 1800,
            distanceMeters: null,
          },
          {
            id: 'unknown',
            sportType: 'RUN',
            durationSeconds: null,
            distanceMeters: null,
          },
        ],
      ),
    ).toEqual({
      matches: [],
      reviews: [
        {
          activityId: 1,
          reason: 'INSUFFICIENT_EVIDENCE',
          candidateWorkoutIds: ['known', 'unknown'],
        },
      ],
    });
  });

  it('uses distance evidence to distinguish equal-duration prescriptions', () => {
    expect(
      matchWorkoutDay(
        [
          {
            id: 1,
            sportType: 'RUN',
            durationSeconds: 1800,
            distanceMeters: 5000,
          },
        ],
        [
          {
            id: 'five-k',
            sportType: 'RUN',
            durationSeconds: 1800,
            distanceMeters: 5000,
          },
          {
            id: 'ten-k',
            sportType: 'RUN',
            durationSeconds: 1800,
            distanceMeters: 10000,
          },
        ],
      ),
    ).toEqual({
      matches: [{ activityId: 1, workoutId: 'five-k' }],
      reviews: [],
    });
  });

  it('assigns two activities to their distinct workouts together, regardless of input order', () => {
    const activities = [
      { id: 2, sportType: 'RUN', durationSeconds: 3600, distanceMeters: null },
      { id: 1, sportType: 'RUN', durationSeconds: 1800, distanceMeters: null },
    ];
    const workouts = [
      {
        id: 'long-course',
        sportType: 'RUN',
        durationSeconds: 3600,
        distanceMeters: null,
      },
      {
        id: 'short-course',
        sportType: 'RUN',
        durationSeconds: 1800,
        distanceMeters: null,
      },
    ];
    expect(matchWorkoutDay(activities, workouts)).toEqual({
      matches: [
        { activityId: 1, workoutId: 'short-course' },
        { activityId: 2, workoutId: 'long-course' },
      ],
      reviews: [],
    });
  });
  const run = (
    id: number,
    durationSeconds: number | null,
    distanceMeters: number | null = null,
  ) => ({ id, sportType: 'RUN', durationSeconds, distanceMeters });
  const course = (
    id: string,
    durationSeconds: number | null,
    distanceMeters: number | null = null,
  ) => ({ id, sportType: 'RUN', durationSeconds, distanceMeters });
  it('does not manufacture certainty from unconstrained assignments and extra unplanned activities', () => {
    const decision = matchWorkoutDay(
      [run(1, 1800), run(2, 3600)],
      [course('known', 1800), course('unknown', null)],
    );
    expect(decision.matches).toEqual([]);
    expect(decision.reviews).toHaveLength(2);
  });
  it('does not choose between equally plausible activities competing for one course', () => {
    expect(
      matchWorkoutDay([run(2, 1800), run(1, 1800)], [course('run', 1800)]),
    ).toMatchObject({
      matches: [],
      reviews: [
        { activityId: 1, reason: 'AMBIGUOUS' },
        { activityId: 2, reason: 'AMBIGUOUS' },
      ],
    });
  });
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, null])(
    'treats invalid duration %s as missing evidence',
    (value) => {
      expect(
        matchWorkoutDay([run(1, value)], [course('run', 1800)]),
      ).toMatchObject({
        matches: [],
        reviews: [{ reason: 'INSUFFICIENT_EVIDENCE' }],
      });
    },
  );
  it('can use a distance-only ordinary course without inventing duration', () => {
    expect(
      matchWorkoutDay([run(1, 1800, 5000)], [course('run', null, 5000)]),
    ).toEqual({ matches: [{ activityId: 1, workoutId: 'run' }], reviews: [] });
  });
  it('rejects mismatched sport and incompatible duration or distance', () => {
    expect(
      matchWorkoutDay(
        [run(1, 1800, 5000)],
        [
          { ...course('swim', 1800, 5000), sportType: 'SWIM' },
          course('long', 4000, 5000),
          course('far', 1800, 10000),
        ],
      ),
    ).toEqual({ matches: [], reviews: [] });
  });
  it('leaves unknown sport and strength sessions without metrics for manual review', () => {
    expect(
      matchWorkoutDay(
        [
          {
            ...run(1, null),
            sportType: 'UNKNOWN',
            sportDefinitionCode: 'STRENGTH_TRAINING',
          },
        ],
        [
          {
            ...course('strength', null),
            sportType: 'UNKNOWN',
            sportDefinitionCode: 'STRENGTH_TRAINING',
          },
        ],
      ),
    ).toMatchObject({
      matches: [],
      reviews: [{ reason: 'INSUFFICIENT_EVIDENCE' }],
    });
    expect(
      matchWorkoutDay(
        [{ ...run(1, 1800), sportType: 'UNKNOWN' }],
        [course('run', 1800)],
      ),
    ).toMatchObject({
      matches: [],
      reviews: [{ reason: 'INSUFFICIENT_EVIDENCE' }],
    });
  });
  it('handles empty input and bounds dense candidate sets with a review', () => {
    expect(matchWorkoutDay([], [])).toEqual({ matches: [], reviews: [] });
    expect(
      matchWorkoutDay(
        [run(1, 1800)],
        Array.from({ length: 13 }, (_, i) => course(String(i), 1800)),
      ),
    ).toMatchObject({
      matches: [],
      reviews: [{ reason: 'COMPLEX_CANDIDATES' }],
    });
  });
  it('is invariant to all input permutations for two distinct sports and courses', () => {
    const activities = [run(1, 1800), { ...run(2, 3600), sportType: 'RIDE' }];
    const workouts = [
      course('run', 1800),
      { ...course('ride', 3600), sportType: 'RIDE' },
    ];
    for (const a of [activities, [...activities].reverse()])
      for (const w of [workouts, [...workouts].reverse()])
        expect(matchWorkoutDay(a, w)).toEqual({
          matches: [
            { activityId: 1, workoutId: 'run' },
            { activityId: 2, workoutId: 'ride' },
          ],
          reviews: [],
        });
  });
  it('keeps an unknown-sport workout as a possible competitor', () => {
    expect(
      matchWorkoutDay(
        [run(1, 1800)],
        [
          course('known', 1800),
          { ...course('unknown', 1800), sportType: 'UNKNOWN' },
        ],
      ),
    ).toMatchObject({
      matches: [],
      reviews: [
        {
          reason: 'INSUFFICIENT_EVIDENCE',
          candidateWorkoutIds: ['known', 'unknown'],
        },
      ],
    });
  });
  it('does not discard an activity with unknown sport to manufacture certainty for another activity', () => {
    expect(
      matchWorkoutDay(
        [run(1, 1800), { ...run(2, 1800), sportType: 'UNKNOWN' }],
        [course('run', 1800)],
      ),
    ).toMatchObject({
      matches: [],
      reviews: [
        { reason: 'INSUFFICIENT_EVIDENCE' },
        { reason: 'INSUFFICIENT_EVIDENCE' },
      ],
    });
  });

  it('does not sacrifice one exact match merely to force an extra unplanned activity into a course', () => {
    expect(
      matchWorkoutDay(
        [run(1, 1800), run(2, 2600)],
        [course('exact', 1800), course('shorter', 1200)],
      ),
    ).toMatchObject({ matches: [{ activityId: 1, workoutId: 'exact' }] });
  });
  it('compares weak single-candidate evidence with leaving the activity unlinked', () => {
    expect(
      matchWorkoutDay([run(1, 1800)], [course('weak', 3000)]),
    ).toMatchObject({
      matches: [],
      reviews: [{ reason: 'INSUFFICIENT_EVIDENCE' }],
    });
  });
});
