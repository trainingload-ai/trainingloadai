import type {
  AskUserQuestionData,
  CoachPlanDraftData,
  CoachQuestionReplyToolResultPayload,
  PlanWorkoutAdjustmentDraftData,
} from "@shared/ai-coach-schema";

/** 与 client CoachUiMessage 对齐的 read 工具名 */
export type CoachDemoReadToolName =
  | "PlanDayView"
  | "ActivityRecent"
  | "PmcRange";

export type CoachDemoReadCard = {
  name: CoachDemoReadToolName;
  title: string;
  subtitle?: string;
  stats?: Array<{ label: string; value: string }>;
};

/** assistant 消息内的 part，按 AuiAssistantMessage 渲染顺序排列 */
export type CoachDemoAssistantPart =
  | { type: "text"; text: string }
  | { type: "readCards"; cards: CoachDemoReadCard[] }
  | {
      type: "question";
      data: AskUserQuestionData;
      reply: CoachQuestionReplyToolResultPayload;
    }
  | { type: "planAdjustment"; data: PlanWorkoutAdjustmentDraftData }
  | { type: "planDraft"; data: CoachPlanDraftData };

export type CoachDemoMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; parts: CoachDemoAssistantPart[] };

export type CoachDemoSession = {
  id: string;
  title: string;
  bucket: "today" | "yesterday" | "past";
  composer: string;
  messages: CoachDemoMessage[];
};

export type CoachDemoQuestionUi = {
  title: string;
  answeredBadge: string;
  submit: string;
  answeredCount: (answered: number, total: number) => string;
};

export type CoachDemoReadCardsUi = {
  toggleDetails: string;
};

export type CoachDemoWorkoutAdjustmentUi = {
  before: string;
  after: string;
  apply: string;
  changes: string;
  position: (week: number, day: number) => string;
};

export type CoachDemoPlanDraftUi = {
  weekColumn: string;
  weekdays: string[];
  weekLabel: (week: number) => string;
  restLabel: string;
  summary: (weeks: number, sessions: number) => string;
  createPlan: string;
};

export type CoachDemoCopy = {
  review: string;
  history: string;
  newChat: string;
  today: string;
  yesterday: string;
  past: string;
  composerHint: string;
  thinking: string;
  send: string;
  questions: CoachDemoQuestionUi;
  readCards: CoachDemoReadCardsUi;
  workoutAdjustment: CoachDemoWorkoutAdjustmentUi;
  planDraft: CoachDemoPlanDraftUi;
  sessions: CoachDemoSession[];
};
