export type MatchingSession = {
  sportType: string | null;
  sportDefinitionCode?: string | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};
export type MatchingActivity = MatchingSession & { id: number };
export type MatchingWorkout = MatchingSession & { id: string };
export type WorkoutMatchingReview = {
  activityId: number;
  reason: 'AMBIGUOUS' | 'INSUFFICIENT_EVIDENCE' | 'COMPLEX_CANDIDATES';
  candidateWorkoutIds: string[];
};

const MIN_ASSIGNMENT_MARGIN = 0.1;
// A recorded activity may be unplanned. Extra pairs must justify their own evidence.
const UNMATCHED_ACTIVITY_COST = 0.35;
const EPSILON = 1e-9;
const positive = (value: number | null) =>
  value != null && Number.isFinite(value) && value > 0;

function sport(session: MatchingSession) {
  if (session.sportDefinitionCode === 'STRENGTH_TRAINING') return 'STRENGTH';
  return session.sportType && session.sportType !== 'UNKNOWN'
    ? session.sportType
    : null;
}

/** All sessions belong to the same athlete-local calendar day. Parent plans carry no preference. */
export function matchWorkoutDay(
  activityInput: MatchingActivity[],
  workoutInput: MatchingWorkout[],
) {
  const activities = [...activityInput].sort((a, b) => a.id - b.id);
  const workouts = [...workoutInput].sort((a, b) => a.id.localeCompare(b.id));
  const edges = activities.map((activity) =>
    workouts.map((workout) => {
      const activitySport = sport(activity);
      const workoutSport = sport(workout);
      if (activitySport && workoutSport && activitySport !== workoutSport)
        return null;
      const errors: number[] = [];
      for (const [key, limit] of [
        ['durationSeconds', 0.5],
        ['distanceMeters', 0.25],
      ] as const) {
        if (!positive(activity[key]) || !positive(workout[key])) continue;
        const error = Math.abs(activity[key]! - workout[key]!) / workout[key]!;
        if (error > limit + EPSILON) return null;
        errors.push(error);
      }
      // Missing evidence is a possible competing relationship, never permission to link.
      return {
        cost: errors.length
          ? errors.reduce((sum, value) => sum + value, 0) / errors.length
          : 0,
        supported: Boolean(activitySport && workoutSport) && errors.length > 0,
      };
    }),
  );
  const candidates = (index: number) =>
    workouts.filter((_workout, j) => edges[index][j] != null);
  if (workouts.length > 12 || activities.length > 24) {
    return {
      matches: [] as Array<{ activityId: number; workoutId: string }>,
      reviews: activities.flatMap((activity, i) =>
        candidates(i).length
          ? [
              {
                activityId: activity.id,
                reason: 'COMPLEX_CANDIDATES' as const,
                candidateWorkoutIds: candidates(i).map((workout) => workout.id),
              },
            ]
          : [],
      ),
    };
  }

  type Assignment = { cost: number; pairs: Array<[number, number]> };
  const solve = (
    excluded?: [number, number],
  ): Assignment & { score: number } => {
    let states = new Map<number, Assignment>([[0, { cost: 0, pairs: [] }]]);
    for (let i = 0; i < activities.length; i++) {
      const next = new Map(states);
      for (const [mask, state] of states) {
        for (let j = 0; j < workouts.length; j++) {
          const edge = edges[i][j];
          if (
            !edge ||
            mask & (1 << j) ||
            (excluded?.[0] === i && excluded[1] === j)
          )
            continue;
          const key = mask | (1 << j);
          const cost = state.cost + edge.cost;
          if (!next.has(key) || cost < next.get(key)!.cost - EPSILON)
            next.set(key, { cost, pairs: [...state.pairs, [i, j]] });
        }
      }
      states = next;
    }
    let best: Assignment = { cost: 0, pairs: [] };
    const score = (state: Assignment) =>
      state.cost +
      (activities.length - state.pairs.length) * UNMATCHED_ACTIVITY_COST;
    for (const state of states.values()) {
      if (
        score(state) < score(best) - EPSILON ||
        (Math.abs(score(state) - score(best)) <= EPSILON &&
          state.pairs.length > best.pairs.length)
      )
        best = state;
    }
    return { ...best, score: score(best) };
  };

  const best = solve();
  const accepted = best.pairs.filter(([i, j]) => {
    if (!edges[i][j]!.supported) return false;
    // An unconstrained competitor cannot become evidence through maximum cardinality.
    if (
      edges[i].some((edge) => edge && !edge.supported) ||
      edges.some((row) => row[j] && !row[j]!.supported)
    )
      return false;
    const alternative = solve([i, j]);
    return alternative.score - best.score >= MIN_ASSIGNMENT_MARGIN - EPSILON;
  });
  const matches = accepted.map(([i, j]) => ({
    activityId: activities[i].id,
    workoutId: workouts[j].id,
  }));
  const matchedActivities = new Set(matches.map((match) => match.activityId));
  const matchedWorkouts = new Set(matches.map((match) => match.workoutId));
  const reviews: WorkoutMatchingReview[] = activities.flatMap((activity, i) => {
    if (matchedActivities.has(activity.id)) return [];
    const possible = candidates(i).filter(
      (workout) => !matchedWorkouts.has(workout.id),
    );
    if (!possible.length) return [];
    const insufficient =
      !sport(activity) ||
      possible.every(
        (workout) =>
          (edges[i][workouts.indexOf(workout)]?.cost ?? 0) >
          UNMATCHED_ACTIVITY_COST - MIN_ASSIGNMENT_MARGIN,
      ) ||
      possible.some(
        (workout) =>
          !edges[i][workouts.indexOf(workout)]?.supported ||
          edges.some(
            (row) =>
              row[workouts.indexOf(workout)] != null &&
              !row[workouts.indexOf(workout)]!.supported,
          ),
      );
    return [
      {
        activityId: activity.id,
        reason: insufficient ? 'INSUFFICIENT_EVIDENCE' : 'AMBIGUOUS',
        candidateWorkoutIds: possible.map((workout) => workout.id),
      },
    ];
  });
  return { matches, reviews };
}
