export type DayWorkoutItem = {
  id: string;
  title: string;
  sport: "run" | "bike" | "swim" | "strength";
  duration: string;
  sessionCount: number;
  focus: string;
  detail: string;
  status: string;
  statusType: "done" | "key" | "pending";
  linkedLabel: string | null;
};

export type DayPlanDemoData = {
  date: string;
  dateLabel: string;
  weekday: string;
  cycle: string;
  weekLabel: string;
  intent: string;
  summary: {
    plannedLoad: number;
    completedLoad: number;
    plannedDuration: string;
    completedCount: number;
    totalCount: number;
  };
  coach: {
    title: string;
    body: string;
    tags: string[];
    askCoach: string;
  };
  workouts: DayWorkoutItem[];
  weekContext: Array<{ day: string; load: number; active: boolean }>;
};

export type HomeDayDemoCopy = {
  backHome: string;
  coachTitle: string;
  previousDay: string;
  nextDay: string;
  todayPlanMeta: string;
  overviewTitle: string;
  plannedLoad: string;
  completed: string;
  plannedDuration: string;
  progress: string;
  timelineTitle: string;
  timelineMeta: string;
  linkedActivity: string;
  actionPostpone: string;
  actionSkip: string;
  actionDelete: string;
  deleteDisabledTip: string;
  linkActivity: string;
  weekContextTitle: string;
  uploadTitle: string;
  uploadCardTitle: string;
  uploadDescription: string;
  uploadSelectFile: string;
};

export type HomeDayDemoCopyMap = Record<string, HomeDayDemoCopy>;
