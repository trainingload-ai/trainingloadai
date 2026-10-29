import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingCoachDecision } from "@/api/ai-coach";
import { HomeSuggestionCardStack } from "./home-suggestion-card-stack";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  apply: vi.fn(),
  reject: vi.fn(),
  openAssessment: vi.fn(),
  dismissAssessment: vi.fn(),
  recordSuggestionInteraction: vi.fn(),
  createSuggestionWorkout: vi.fn(),
  scheduleSuggestionReminder: vi.fn(),
  push: vi.fn(),
  invalidate: vi.fn(),
  publicDemo: { active: false },
}));
vi.mock("@/api/ai-coach", () => ({
  fetchCoachHomeReviewState: mocks.fetch,
  confirmAndApplyCoachDecision: mocks.apply,
  rejectCoachDecision: mocks.reject,
  openCoachAssessmentCase: mocks.openAssessment,
  dismissCoachAssessmentCase: mocks.dismissAssessment,
}));
vi.mock("@/api/ai-today-suggestion", () => ({
  recordTodaySuggestionInteraction: mocks.recordSuggestionInteraction,
  createTodaySuggestionWorkout: mocks.createSuggestionWorkout,
  scheduleTodaySuggestionReminder: mocks.scheduleSuggestionReminder,
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/lib/query-invalidation", () => ({
  invalidateAfterPlanMutation: mocks.invalidate,
}));
vi.mock("@/public-demo/public-demo-provider", () => ({
  usePublicDemo: () => mocks.publicDemo,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, args?: Record<string, string>) =>
    [key, ...Object.values(args ?? {})].join(" "),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@deployment/managed-ui", () => ({
  HomeAccessExtension: () => <button>Open access options</button>,
  AccessGuardedLink: ({
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}));

const decision = {
  id: "decision-1",
  branchId: "branch-1",
  contextId: "context-1",
  planId: "plan-1",
  openReason: "runtime_day_review",
  planTitle: "5K base plan",
  decisionType: "PLAN_WORKOUT_UPDATE",
  rationale: "Replace intervals with a short recovery run.",
  payload: {},
  workout: { name: "Intervals" },
  adjustment: { kind: "reduce_intensity", after: { summary: "Recovery run" } },
} as PendingCoachDecision;
const suggestion = {
  title: "Today’s advice",
  date: "9/6",
  weekday: "Sunday",
  summary: "Stay easy today and keep your effort comfortable.",
  tags: ["Base", "Recovery", "Easy", "Fourth tag"],
  weatherAttribution: {
    serviceName: "WeatherKit",
    modified: true as const,
    legalPageUrl: "https://weatherkit.apple.com/legal-attribution.html",
  },
};

function mount(
  card: React.ComponentProps<
    typeof HomeSuggestionCardStack
  >["suggestion"] = suggestion,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <HomeSuggestionCardStack
        suggestion={card}
        suggestionLeadingActions={<button>Create plan</button>}
      />
    </QueryClientProvider>,
  );
}
async function openDecision() {
  const card = await screen.findByRole("button", {
    name: `decisionStack.title · ${decision.rationale}`,
  });
  fireEvent.click(card);
  return screen.findByRole("dialog");
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.publicDemo.active = false;
  mocks.fetch.mockResolvedValue({ decisions: [decision], guidance: null });
  mocks.apply.mockResolvedValue(undefined);
  mocks.reject.mockResolvedValue(undefined);
  mocks.openAssessment.mockResolvedValue({
    sessionId: "assessment:case-1",
    branchId: null,
    contextId: null,
    planId: null,
    questionMessageId: "question-message-1",
  });
  mocks.dismissAssessment.mockResolvedValue(undefined);
  mocks.recordSuggestionInteraction.mockResolvedValue(undefined);
  mocks.createSuggestionWorkout.mockResolvedValue(undefined);
  mocks.scheduleSuggestionReminder.mockResolvedValue(undefined);
  mocks.invalidate.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("home suggestion cards and decision details", () => {
  it("does not request pending AI actions in public Demo mode", async () => {
    mocks.publicDemo.active = true;
    mount();

    await waitFor(() => expect(mocks.fetch).not.toHaveBeenCalled());
  });

  it("shows summary-only cards and applies a decision only from its detail sheet", async () => {
    mount();
    await screen.findByRole("button", {
      name: `decisionStack.title · ${decision.rationale}`,
    });
    expect(
      screen.queryByRole("button", { name: "decisionStack.confirm" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "decisionStack.dismiss" }),
    ).not.toBeInTheDocument();
    const sheet = await openDecision();
    expect(
      within(sheet).getByText(
        /decisionStack.reduceIntensityImpact Intervals Recovery run/,
      ),
    ).toBeVisible();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    mocks.fetch.mockResolvedValue({ decisions: [], guidance: null });
    fireEvent.click(
      within(sheet).getByRole("button", { name: "decisionStack.confirm" }),
    );
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1));
    expect(mocks.apply.mock.calls[0][0]).toBe(decision.id);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
  });

  it("closing details does not reject; ignoring does, and removes the card", async () => {
    mount();
    let sheet = await openDecision();
    fireEvent.click(within(sheet).getByRole("button", { name: "close" }));
    expect(mocks.reject).not.toHaveBeenCalled();
    sheet = await openDecision();
    mocks.fetch.mockResolvedValue({ decisions: [], guidance: null });
    fireEvent.click(
      within(sheet).getByRole("button", { name: "decisionStack.dismiss" }),
    );
    await waitFor(() =>
      expect(mocks.reject.mock.calls[0][0]).toBe(decision.id),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("opens ordinary advice with all tags and the weather source, preserving the create-plan entry", async () => {
    mocks.fetch.mockResolvedValue({ decisions: [], guidance: null });
    mount();
    expect(screen.getByRole("button", { name: "Create plan" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Open access options" }),
    ).toBeVisible();
    const coachShortcut = screen.getByRole("link", {
      name: "header.askCoach",
    });
    expect(coachShortcut).toHaveAttribute("href", "/ai-coach");
    expect(coachShortcut).toHaveClass(
      "size-8",
      "bg-foreground",
      "text-background",
    );
    expect(coachShortcut.parentElement).toContainElement(
      screen.getByRole("button", { name: "Create plan" }),
    );
    fireEvent.click(screen.getByRole("button", { name: suggestion.title }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Fourth tag")).toBeVisible();
    expect(
      within(sheet).getByRole("link", { name: /WeatherKit/ }),
    ).toHaveAttribute("href", suggestion.weatherAttribution.legalPageUrl);
    expect(
      within(sheet).getByRole("link", { name: "header.askCoach" }),
    ).toHaveAttribute("href", "/ai-coach");
    expect(
      within(sheet).queryByRole("button", { name: "decisionStack.confirm" }),
    ).not.toBeInTheDocument();
  });

  it("shows a complete V2 suggestion and exposes its resolved actions on the card", async () => {
    mocks.fetch.mockResolvedValue({ decisions: [], guidance: null });
    const completeSuggestion = {
      ...suggestion,
      summary:
        "Import an activity or tell the coach about your available time and how you feel today.",
      details: {
        version: 2 as const,
        suggestionId: "suggestion-1",
        delivery: {
          state: "FACT_FALLBACK" as const,
          reasonCode: "AI_NOT_CONFIGURED" as const,
          generatedAt: null,
        },
        headline: "Complete the facts needed for today",
        summary:
          "Import an activity or tell the coach about your available time and how you feel today.",
        recommendation: { kind: "SYNC_DATA" as const },
        confidence: "LOW" as const,
        evidence: [
          {
            code: "NEVER_RECORDED_ACTIVITY",
            label: "No recorded activity yet",
            evidenceRefs: ["constraint:one"],
          },
          {
            code: "NO_ACTIVE_PLAN",
            label: "No active plan",
            evidenceRefs: ["constraint:one"],
          },
        ],
        primaryIntent: {
          type: "OPEN_IMPORT" as const,
          label: "Import activity",
        },
        secondaryIntents: [
          {
            type: "ASK_COACH" as const,
            label: "Ask coach",
            starterCode: "today-context",
          },
        ],
        validUntil: "2026-10-28T15:59:59.999Z",
        tags: ["More context needed"],
        source: "fallback" as const,
        shouldRefresh: false,
        generatedAt: null,
      },
    };

    mount(completeSuggestion);

    expect(
      await screen.findByText("Complete the facts needed for today"),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Import an activity or tell the coach about your available time and how you feel today.",
      ),
    ).toBeVisible();
    expect(screen.getByText("No recorded activity yet")).toBeVisible();
    expect(screen.getByText("No active plan")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", {
        name: "todaySuggestionActions.viewSuggestion",
      }),
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        expect.stringContaining("/ai-coach?"),
      ),
    );
    expect(mocks.recordSuggestionInteraction).toHaveBeenCalledWith(
      "suggestion-1",
      { kind: "INTENT_SELECTED", intentType: "ASK_COACH" },
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Complete the facts needed for today · Import an activity or tell the coach about your available time and how you feel today.",
      }),
    );
    const sheet = await screen.findByRole("dialog");
    expect(
      within(sheet).getByText("todaySuggestionActions.reasoning"),
    ).toBeVisible();
    expect(within(sheet).getByText("No recorded activity yet")).toBeVisible();
    expect(within(sheet).getByText("No active plan")).toBeVisible();
    fireEvent.click(
      within(sheet).getByRole("button", { name: "Import activity" }),
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/activities#import"),
    );
    expect(mocks.recordSuggestionInteraction).toHaveBeenCalledWith(
      "suggestion-1",
      { kind: "INTENT_SELECTED", intentType: "OPEN_IMPORT" },
    );
  });

  it("opens workout advice before adding the proposed independent workout", async () => {
    mocks.fetch.mockResolvedValue({ decisions: [], guidance: null });
    mocks.createSuggestionWorkout.mockResolvedValue({
      workoutId: "workout-1",
      actionId: "action-1",
      undoUntil: null,
      intent: {
        type: "OPEN_TODAY_WORKOUT",
        label: "Open today's workout",
        workoutId: "workout-1",
        scheduledDate: "2026-10-28",
        planId: null,
      },
    });
    mount({
      ...suggestion,
      details: {
        version: 2,
        suggestionId: "suggestion-workout",
        delivery: {
          state: "GENERATED",
          reasonCode: "GENERATED",
          generatedAt: "2026-10-28T08:00:00.000Z",
        },
        headline: "Easy run today",
        summary: "Keep the session relaxed.",
        recommendation: { kind: "TRAIN", durationMinutes: 20 },
        confidence: "MEDIUM",
        evidence: [],
        primaryIntent: {
          type: "CREATE_TODAY_WORKOUT",
          label: "Add as today's workout",
          proposalToken: "signed-token",
          preview: {
            sportType: "RUN",
            sportDefinitionCode: "ROAD_RUNNING",
            name: "Gentle aerobic restart",
            notes:
              "Warm up for 3 minutes, run conversationally for 12 minutes, then walk for 5 minutes.",
            structureKind: "ENDURANCE",
            dslVersion: 1,
            text: "warmup 3m\nwork 12m\ncooldown 5m",
            structure: { kind: "ENDURANCE", version: 1, blocks: [] },
            summary: {
              kind: "ENDURANCE",
              durationSeconds: 1200,
              stepCount: 3,
              hardSession: false,
            },
          },
        },
        secondaryIntents: [],
        validUntil: "2026-10-28T16:00:00.000Z",
        tags: ["Easy"],
        source: "generated",
        shouldRefresh: true,
        generatedAt: "2026-10-28T08:00:00.000Z",
      },
    });

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Easy run today · Stay easy today and keep your effort comfortable.",
      }),
    );
    expect(mocks.createSuggestionWorkout).not.toHaveBeenCalled();
    const sheet = await screen.findByRole("dialog");
    expect(
      within(sheet).queryByText("todaySuggestionActions.reasoning"),
    ).not.toBeInTheDocument();
    expect(within(sheet).getByText("Gentle aerobic restart")).toBeVisible();
    expect(
      within(sheet).getByText(
        "Warm up for 3 minutes, run conversationally for 12 minutes, then walk for 5 minutes.",
      ),
    ).toBeVisible();
    expect(
      within(sheet).getByText("todaySuggestionActions.independentWorkoutNote"),
    ).toBeVisible();

    fireEvent.click(
      within(sheet).getByRole("button", { name: "Gentle aerobic restart" }),
    );
    const workoutPreview = await screen.findByRole("dialog", {
      name: "Gentle aerobic restart",
    });
    expect(
      within(workoutPreview).getByText(
        "Warm up for 3 minutes, run conversationally for 12 minutes, then walk for 5 minutes.",
      ),
    ).toBeVisible();
    expect(mocks.createSuggestionWorkout).not.toHaveBeenCalled();

    fireEvent.click(
      within(workoutPreview).getByRole("button", {
        name: "Add as today's workout",
      }),
    );
    await waitFor(() =>
      expect(mocks.createSuggestionWorkout).toHaveBeenCalledWith(
        "suggestion-workout",
      ),
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        "/day/2026-10-28?workout=workout-1",
      ),
    );
  });

  it("does not crash when a cached suggestion contains a legacy workout proposal", async () => {
    mocks.fetch.mockResolvedValue({ decisions: [], guidance: null });
    const legacySuggestion = {
      ...suggestion,
      details: {
        version: 2,
        suggestionId: "legacy-suggestion",
        delivery: {
          state: "CACHED",
          reasonCode: "CACHE_HIT",
          generatedAt: "2026-10-28T08:00:00.000Z",
        },
        headline: "Easy run today",
        summary: "Keep the session relaxed.",
        recommendation: { kind: "TRAIN", durationMinutes: 20 },
        confidence: "MEDIUM",
        evidence: [],
        primaryIntent: {
          type: "CREATE_TODAY_WORKOUT",
          label: "Add as today's workout",
          proposalToken: "legacy-token",
          preview: {
            sportType: "RUN",
            name: "Easy run",
            durationMinutes: 20,
            intensity: "VERY_EASY",
            rationale: "Restart with a short easy session.",
          },
        },
        secondaryIntents: [
          {
            type: "ASK_COACH",
            label: "Ask coach",
            starterCode: "today-context",
          },
        ],
        validUntil: "2026-10-28T16:00:00.000Z",
        tags: ["Easy"],
        source: "cache",
        shouldRefresh: false,
        generatedAt: "2026-10-28T08:00:00.000Z",
      },
    } as unknown as React.ComponentProps<
      typeof HomeSuggestionCardStack
    >["suggestion"];

    expect(() => mount(legacySuggestion)).not.toThrow();
    expect(await screen.findByText("Easy run today")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Add as today's workout" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Easy run today · Stay easy today and keep your effort comfortable.",
      }),
    );
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).queryByText("Easy run")).not.toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole("button", { name: "Ask coach" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    const href = new URL(mocks.push.mock.calls[0][0], "https://example.test");
    expect(href.pathname).toBe("/ai-coach");
    expect(Object.fromEntries(href.searchParams)).toEqual({
      intent: "today-suggestion",
      source: "home-today-suggestion",
      openReason: "today_suggestion",
      todaySuggestionId: "legacy-suggestion",
      prompt: "todaySuggestionActions.coachPrompt",
      starterCode: "today-context",
    });
    expect(mocks.recordSuggestionInteraction).toHaveBeenCalledWith(
      "legacy-suggestion",
      { kind: "INTENT_SELECTED", intentType: "ASK_COACH" },
    );
    expect(
      JSON.parse(
        window.sessionStorage.getItem(
          "trainingload:today-suggestion-coach:legacy-suggestion",
        ) ?? "null",
      ),
    ).toMatchObject({
      suggestionId: "legacy-suggestion",
      headline: "Easy run today",
      summary: "Keep the session relaxed.",
    });
  });

  it("locks pending actions, keeps failed details open, and permits a retry", async () => {
    let fail!: (error: Error) => void;
    mocks.apply.mockReturnValueOnce(
      new Promise((_, reject) => {
        fail = reject;
      }),
    );
    mount();
    const sheet = await openDecision();
    const confirm = within(sheet).getByRole("button", {
      name: "decisionStack.confirm",
    });
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    expect(
      within(sheet).getByRole("button", { name: "decisionStack.dismiss" }),
    ).toBeDisabled();
    fireEvent.click(within(sheet).getByRole("button", { name: "close" }));
    expect(sheet).toBeVisible();
    await act(async () => {
      fail(new Error("Please retry"));
    });
    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "Please retry",
    );
    expect(confirm).toBeEnabled();
    mocks.fetch.mockResolvedValue({ decisions: [], guidance: null });
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("preserves decision context on the coach link", async () => {
    mount();
    const sheet = await openDecision();
    const href = within(sheet)
      .getByRole("link", { name: "header.askCoach" })
      .getAttribute("href");
    expect(href).toContain("branchId=branch-1");
    expect(href).toContain("contextId=context-1");
    expect(href).toContain("planId=plan-1");
  });

  it("opens review guidance without apply or dismiss actions", async () => {
    mocks.fetch.mockResolvedValue({
      decisions: [],
      guidance: {
        id: "guidance-1",
        contextId: "context-1",
        planId: "plan-1",
        planTitle: "5K base plan",
        rationale: "Two sessions were missed; resume with an easy run.",
        scale: "weekly",
        evidenceCodes: ["MISSED_WORKOUT"],
        createdAt: "2026-09-11T00:00:00.000Z",
      },
    });
    mount();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "aiTodaySuggestion.title · Two sessions were missed; resume with an easy run.",
      }),
    );
    const sheet = await screen.findByRole("dialog");
    expect(
      within(sheet).getByText(
        "Two sessions were missed; resume with an easy run.",
      ),
    ).toBeVisible();
    expect(
      within(sheet).queryByRole("button", { name: "decisionStack.confirm" }),
    ).not.toBeInTheDocument();
    expect(
      within(sheet).queryByRole("button", { name: "decisionStack.dismiss" }),
    ).not.toBeInTheDocument();
    expect(
      within(sheet).getByRole("link", { name: "header.askCoach" }),
    ).toHaveAttribute("href", expect.stringContaining("contextId=context-1"));
  });

  it("shows what state is missing and why before opening an inquiry", async () => {
    const inquiry = {
      caseId: "case-1",
      questionId: "question-1",
      title: "补充一项状态信息",
      observation: "现有数据还不足以可靠判断今天的恢复状态。",
      reason: "需要区分近期零负荷是真实休息、未记录还是未同步。",
      decisionImpact: "答案会决定是渐进恢复，还是先补齐训练数据。",
      question: {
        id: "recent_training",
        header: "近期训练",
        question: "过去7天你的训练情况最接近哪一种？",
        options: [
          {
            value: "none",
            label: "基本没有训练",
            description: "以休息为主。",
          },
        ],
      },
      state: "UNKNOWN",
      confidence: 0.2,
      expiresAt: "2026-09-12T00:00:00.000Z",
    };
    mocks.fetch.mockResolvedValue({
      decisions: [],
      guidance: null,
      inquiry,
    });

    mount();
    const card = await screen.findByRole("button", {
      name: `${inquiry.title} · ${inquiry.question.question} · ${inquiry.reason}`,
    });
    expect(within(card).getByText(inquiry.question.question)).toBeVisible();
    expect(within(card).getByText(inquiry.reason)).toBeVisible();

    fireEvent.click(card);
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText(inquiry.question.question)).toBeVisible();
    expect(within(sheet).getByText(inquiry.reason)).toBeVisible();
    expect(within(sheet).getByText(inquiry.decisionImpact)).toBeVisible();
    expect(within(sheet).getByText(inquiry.observation)).toBeVisible();
  });
});
