import {
  render as renderUi,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  FitnessAssessmentCard,
  FitnessTrackingCard,
} from "./fitness-assessment-card";
import type { FitnessAssessmentResult } from "@shared/fitness-assessment";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import zhMessages from "../../../../../../../packages/messages/client-core/zh.json";
import enMessages from "../../../../../../../packages/messages/client-core/en.json";
function render(ui: ReactElement, locale = "zh") {
  return renderUi(ui, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "zh" ? zhMessages : enMessages}
        timeZone="Asia/Shanghai"
      >
        {children}
      </NextIntlClientProvider>
    ),
  });
}
const fixture = (): FitnessAssessmentResult => ({
  kind: "fitness_assessment_result",
  schemaVersion: 1,
  taskId: "task",
  taskRevision: 1,
  calculationId: "calc",
  sport: "CYCLING",
  requestedScope: { kind: "ACTIVITY", activityHashId: "activity" },
  method: { id: "lthr-30-minute", version: "1", policyVersion: "1" },
  status: "ESTIMATED",
  candidates: [
    { metric: "LTHR", value: 176, unit: "bpm", currentValue: 177, delta: -1 },
  ],
  observations: [],
  evidence: {
    activityCount: 1,
    readyCount: 1,
    includedCount: 1,
    truncated: false,
    from: "2026-09-25T00:00:00Z",
    to: "2026-09-25T10:00:00Z",
    latestEvidenceAt: null,
    activityHashIds: ["activity"],
    checks: [],
  },
  assessedAt: "2026-09-25T10:00:00Z",
  limitations: [],
  nextActions: ["APPLY"],
  applyOptions: [
    {
      id: "target",
      sport: "CYCLING",
      effectiveDate: "2026-09-25",
      changes: [
        {
          metric: "LTHR",
          value: 176,
          unit: "bpm",
          currentValue: 177,
          delta: -1,
        },
      ],
      proposalDigest: "digest",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    },
  ],
  noMetricWrite: true,
});
describe("fitness assessment user actions", () => {
  it("submits only the displayed option and digest, then prevents duplicate clicks", async () => {
    const action = vi.fn(async () => {});
    render(<FitnessAssessmentCard input={fixture()} onAction={action} />);
    fireEvent.click(screen.getByRole("button", { name: "确认采用" }));
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith("确认采用", {
        kind: "fitness_apply_confirmation",
        calculationId: "calc",
        applyOptionId: "target",
        proposalDigest: "digest",
      }),
    );
    expect(screen.getByRole("button", { name: "确认采用" })).toBeDisabled();
  });
  it("disables expired adoption while keeping reassessment available", () => {
    const r = fixture();
    r.applyOptions[0].expiresAt = "2020-01-01T00:00:00Z";
    render(<FitnessAssessmentCard input={r} onAction={() => {}} />);
    const applyButton = screen.getByRole("button", { name: "确认采用" });
    const recomputeButton = screen.getByRole("button", { name: "重新评估" });
    expect(applyButton).toBeDisabled();
    expect(recomputeButton).not.toBeDisabled();
    expect(applyButton.parentElement).toBe(recomputeButton.parentElement);
    expect(applyButton.parentElement).toHaveClass("flex", "flex-wrap");
  });
  it("does not expose incomplete evidence as an assessment form", () => {
    const r = fixture();
    r.status = "NEEDS_INPUT";
    r.reasonCode = "PROTOCOL_UNKNOWN";
    r.candidates = [];
    r.applyOptions = [];
    const { container } = render(
      <FitnessAssessmentCard input={r} onAction={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
  it("reports tracking submission failure and permits a retry", async () => {
    const action = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    render(
      <FitnessTrackingCard
        input={{
          kind: "fitness_tracking_offer",
          taskId: "task",
          workoutId: "workout",
        }}
        onAction={action}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "开启跟踪" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "开启跟踪" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "开启跟踪" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  });
});

describe("generic fitness result presentation", () => {
  it.each([
    ["CS", "SWIM", "critical-speed", 1.5, "m/s"],
    ["TP", "RUN", "running-5k-threshold-pace", 260, "s/km"],
    ["VO2_MAX", "RUN", "running-performance-vdot", 49.81, "ml/kg/min"],
    ["VO2_MAX", "RUN", "running-effective-vo2max", 50, "ml/kg/min"],
    ["RESTING_HR", "UNKNOWN", "daily-resting-hr", 52, "bpm"],
  ] as const)(
    "renders %s through the shared preview card without adoption",
    (metric, sport, method, value, unit) => {
      const r = fixture();
      r.sport = sport;
      r.method.id = method;
      r.candidates = [{ metric, value, unit, currentValue: null, delta: null }];
      r.applyOptions = [];
      r.nextActions = [];
      render(<FitnessAssessmentCard input={r} onAction={() => {}} />);
      expect(
        screen.getByText(
          `${metric === "VO2_MAX" ? "VDOT" : metric}: — → ${value} ${unit}`,
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "确认采用" }),
      ).not.toBeInTheDocument();
    },
  );
  it("shows observed HR in the main result and never labels it final-twenty-minute HR", () => {
    const r = fixture();
    r.status = "OBSERVATION_ONLY";
    r.method.id = "observed-max-hr";
    r.candidates = [];
    r.applyOptions = [];
    r.observations = [{ metric: "observedMaxHr", value: 190, unit: "bpm" }];
    render(<FitnessAssessmentCard input={r} />);
    const observation = screen.getByText(/190.0 bpm/);
    expect(observation.closest("details")).toBeNull();
    expect(observation.textContent).not.toContain("20");
  });
  it("does not offer a test workout or pointless retry for an unsupported method", () => {
    const r = fixture();
    r.status = "UNAVAILABLE";
    r.reasonCode = "METHOD_UNAVAILABLE";
    r.method.id = "aerobic-threshold-unavailable";
    r.candidates = [];
    r.applyOptions = [];
    r.nextActions = [];
    render(<FitnessAssessmentCard input={r} onAction={() => {}} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("user-selected observed MaxHR", () => {
  it("shows reference-setting uncertainty and allows explicit adoption with the bound digest", async () => {
    const r = fixture();
    r.status = "OBSERVATION_ONLY";
    r.method.id = "observed-max-hr";
    r.candidates = [];
    r.observations = [{ metric: "observedMaxHr", value: 190, unit: "bpm" }];
    r.applyOptions[0].changes = [
      {
        metric: "MAX_HR",
        value: 190,
        unit: "bpm",
        currentValue: 185,
        delta: 5,
      },
    ];
    const action = vi.fn(async () => {});
    render(<FitnessAssessmentCard input={r} onAction={action} />);
    expect(screen.getByText(/可能低于真实最大心率/)).toBeVisible();
    expect(screen.getByText(/MAX_HR 185 → 190 bpm/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "确认采用" }));
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith("确认采用", {
        kind: "fitness_apply_confirmation",
        calculationId: "calc",
        applyOptionId: "target",
        proposalDigest: "digest",
      }),
    );
  });
});

describe("fitness translations and legacy VDOT", () => {
  it.each(["zh", "en"])(
    "loads reasons, checks, limitations and evidence from %s messages",
    (locale) => {
      const r = fixture();
      r.status = "ESTIMATED";
      r.reasonCode = "QUALITY_REJECTED";
      r.applyOptions = [];
      r.limitations = [
        "DERIVED_ACTIVITY_ESTIMATES",
        "unknown-future-limitation",
      ];
      r.evidence.checks = [
        { code: "FULL_COVERAGE", passed: false, observed: 0.9 },
      ];
      render(<FitnessAssessmentCard input={r} />, locale);
      const messages = (locale === "zh" ? zhMessages : enMessages).AiCoachPage
        .fitnessAssessment;
      expect(
        screen.getByText(messages.reasons.QUALITY_REJECTED),
      ).toBeInTheDocument();
      expect(
        screen.getByText(messages.limitations.DERIVED_ACTIVITY_ESTIMATES),
      ).toBeInTheDocument();
      expect(
        screen.getByText(messages.limitations.unknown),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          `${messages.checks.FULL_COVERAGE} 90.0% · ${messages.notMet}`,
        ),
      ).toBeInTheDocument();
    },
  );
  it("renders a legacy VDOT result but requires reassessment before adoption", () => {
    const r = fixture();
    r.method.id = "running-performance-vdot";
    r.preparationStatus = "READY";
    r.candidates = [
      { metric: "VDOT", value: 50, unit: "index", currentValue: 48, delta: 2 },
    ];
    r.applyOptions[0].changes = r.candidates;
    render(<FitnessAssessmentCard input={r} onAction={() => {}} />);
    expect(screen.getByText("VDOT: 48 → 50 index")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认采用" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "重新评估" })).toBeEnabled();
  });
});
