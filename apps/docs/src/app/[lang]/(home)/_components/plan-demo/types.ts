export type PlanDemoSport = "run" | "bike" | "swim";

export type PlanDemoWeek = {
  week: number;
  workoutCount: number;
  completedCount: number;
  state: "done" | "current" | "next";
  executionPercent: number;
};

export type PlanDemoDay = {
  dayIndex: number;
  dayLabel: string;
  dateLabel: string;
  isoDate: string;
  workoutCount: number;
  completedCount: number;
  executionPercent: number;
  isToday: boolean;
};

export type PlanDemoWorkout = {
  id: string;
  dayLabel: string;
  dateLabel: string;
  isoDate: string;
  sport: PlanDemoSport;
  sportType: string;
  title: string;
  detail: string;
  estimatedLoad: number;
  loadLabel: string;
  statusLabel: string;
  uiWeekIndex: number;
  uiDayIndex: number;
  isToday: boolean;
  linkedActivity?: string;
};

export type PlanDemoPayload = {
  header: {
    cycleLabel: string;
    title: string;
    weekStatus: string;
    totalSessions: string;
    remainingLabel: string;
    remainingWeeks: string;
    createPlan: string;
  };
  selectedWeek: number;
  weeks: PlanDemoWeek[];
  days: PlanDemoDay[];
  workouts: PlanDemoWorkout[];
  todayWorkout?: PlanDemoWorkout;
  weekGoal: {
    totalSessions: number;
    completedSessions: number;
    currentDayIndex: number;
  };
  coach: {
    title: string;
    summary: string;
  };
};

export type PlanDemoCopy = {
  weekStrip: {
    title: string;
    stateCurrent: string;
  };
  weekLoad: {
    title: string;
    currentWeek: (week: number) => string;
    plannedSessions: string;
  };
  workout: {
    title: string;
    loadBadge: string;
    linked: (activity: string) => string;
    notLinked: string;
    session: (index: number) => string;
  };
  actions: {
    postpone: string;
    skip: string;
    delete: string;
    deleteDisabledTip: string;
  };
  today: {
    title: string;
    viewTodayPlan: string;
    postponeToday: string;
  };
  goal: {
    title: string;
    weekSessions: string;
    completed: string;
    progressTo: string;
    dayNumber: (day: number) => string;
  };
  payload: PlanDemoPayload;
};
