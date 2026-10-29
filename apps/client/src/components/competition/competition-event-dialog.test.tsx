import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CompetitionEvent,
  CompetitionImpactResponse,
} from "@/api/competition-events";
import { CompetitionEventDetails } from "./competition-event-dialog";

const mocks = vi.hoisted(() => ({
  response: null as CompetitionImpactResponse | null,
}));

vi.mock("next-intl", () => ({
  useLocale: () => "zh-CN",
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/api/competition-events", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/api/competition-events")>();
  return {
    ...actual,
    getCurrentCompetitionImpact: vi.fn(async () => mocks.response),
  };
});

const event: CompetitionEvent = {
  id: "competition-1",
  title: "秋季骑行赛",
  sportType: "CYCLING",
  sportDefinitionCode: null,
  sportDefinition: null,
  distanceMeters: 100_000,
  startDate: "2026-11-29",
  endDate: null,
  startTimeMinute: null,
  timezone: "Asia/Shanghai",
  importance: "MEDIUM",
  goalType: "FINISH",
  targetTimeSeconds: null,
  location: null,
  notes: null,
  status: "PLANNED",
  source: "MANUAL",
  version: 1,
  createdAt: "2026-10-13T00:00:00.000Z",
  updatedAt: "2026-10-13T00:00:00.000Z",
};

function impactResponse(status: "SUCCESS" | "FALLBACK") {
  const fallback = status === "FALLBACK";
  return {
    assessmentId: fallback ? null : "assessment-1",
    status,
    cacheHit: false,
    assessedAt: "2026-10-13T00:00:00.000Z",
    confidence: fallback ? 0 : 0.75,
    fallbackVersion: fallback ? "competition-impact-fallback-v1" : null,
    events: [
      {
        id: event.id,
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
        importance: event.importance,
        sportType: event.sportType,
        distanceMeters: event.distanceMeters,
      },
    ],
    result: {
      eventAssessments: [
        {
          eventId: event.id,
          relevant: true,
          confidence: fallback ? 0 : 0.75,
          currentImpactLevel: "MEDIUM" as const,
          influenceWindow: {
            startDate: "2026-11-01",
            endDate: "2026-12-06",
            preEventWeeks: 4,
            postEventWeeks: 1,
          },
          phases: [],
          constraints: [],
          reasoningSummary: fallback
            ? "AI assessment was unavailable; conservative safeguards were derived from event importance, sport, distance, and timing."
            : "个性化赛事影响结论",
          evidence: [],
          assumptions: [],
          riskFlags: [],
        },
      ],
      combinedImpact: {
        overallLevel: "MEDIUM" as const,
        conflicts: [],
        strategySummary: fallback
          ? "Conservative event safeguards are active."
          : "个性化训练策略",
      },
    },
  } satisfies CompetitionImpactResponse;
}

function renderDetails() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CompetitionEventDetails event={event} />
    </QueryClientProvider>,
  );
}

describe("CompetitionEventDetails", () => {
  beforeEach(() => {
    mocks.response = impactResponse("FALLBACK");
  });

  it("localizes fallback guidance and hides meaningless confidence", async () => {
    renderDetails();

    expect(
      await screen.findByText("impact.fallbackSummary"),
    ).toBeInTheDocument();
    expect(screen.getByText("impact.fallbackLabel")).toBeInTheDocument();
    expect(
      screen.queryByText(/AI assessment was unavailable/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("shows confidence only for a personalized assessment", async () => {
    mocks.response = impactResponse("SUCCESS");
    renderDetails();

    expect(await screen.findByText("个性化赛事影响结论")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("impact.confidenceLabel")).toBeInTheDocument();
  });
});
