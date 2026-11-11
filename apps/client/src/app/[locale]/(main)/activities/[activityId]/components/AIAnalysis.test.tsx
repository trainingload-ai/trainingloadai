import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AIAnalysis from "./AIAnalysis";

const mocks = vi.hoisted(() => ({
  accessAllowed: false,
  consentGranted: true,
  reviewQuery: {
    data: { found: false, markdown: "" } as {
      found: boolean;
      markdown?: string;
      status?: string;
    },
    isLoading: false,
    isError: false,
  },
  invalidateQueries: vi.fn(),
  useAiAnalysisStream: vi.fn((..._args: unknown[]) => ({
    data: "",
    isLoading: false,
    isDone: true,
    error: null,
    operation: null,
  })),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "zh",
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/hooks/useActivityId", () => ({
  useActivityId: () => "activity-1",
}));

vi.mock("@/api/feature-access", () => ({
  useFeatureAccess: () => ({
    data: { allowed: mocks.accessAllowed },
    isLoading: false,
  }),
  featureAllowed: (data: { allowed?: boolean } | undefined) =>
    data?.allowed === true,
}));

vi.mock("@/api/ai-data-consent", () => ({
  useAiDataConsent: () => ({
    data: { granted: mocks.consentGranted },
    isLoading: false,
  }),
}));

vi.mock("@/components/ai-consent/AiDataConsentPrompt", () => ({
  AiDataConsentPrompt: () => <div>AI consent required</div>,
}));

vi.mock("@/hooks/useAiAnalysis", () => ({
  useAiAnalysisStream: (...args: unknown[]) =>
    mocks.useAiAnalysisStream(...args),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => mocks.reviewQuery,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock("@/api/activity", () => ({
  fetchActivityAiReview: vi.fn(),
}));

vi.mock("@/lib/query-keys", () => ({
  queryKeys: {
    activity: {
      aiReview: () => ["activity-ai-review"],
    },
    ai: {
      usageSummary: () => ["ai-usage-summary"],
      usageEvents: () => ["ai-usage-events"],
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), warning: vi.fn() },
}));

vi.mock("@deployment/managed-ui", () => ({
  ManagedActivityReviewAccessPrompt: () => {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          managed access prompt
        </button>
        {open ? <div role="dialog">managed access</div> : null}
      </>
    );
  },
}));

vi.mock("./activity-coach-dialog-body", () => ({
  ActivityCoachDialogBody: ({ markdown }: { markdown: string }) => (
    <div data-testid="activity-coach-thread">
      <p>{markdown}</p>
      <button type="button">send</button>
    </div>
  ),
  preloadActivityCoachConversation: vi.fn(),
}));

describe("AIAnalysis feature access", () => {
  it.each(["PENDING", "RUNNING", "FAILED"])(
    "keeps %s reviews loading without starting a competing request",
    (status) => {
      mocks.accessAllowed = true;
      mocks.reviewQuery.data = { found: true, status, markdown: "" };
      const { rerender } = render(<AIAnalysis />);
      expect(screen.getByText("analyzing")).toBeInTheDocument();
      expect(screen.queryByText("analysisFailed")).not.toBeInTheDocument();
      expect(mocks.useAiAnalysisStream).toHaveBeenLastCalledWith(
        "activity-1",
        true,
        0,
        false,
      );
      mocks.reviewQuery.data = {
        found: true,
        status: "SUCCEEDED",
        markdown: "训练已完成，接下来保持轻松恢复。",
      };
      rerender(<AIAnalysis />);
      expect(
        screen.getByRole("button", { name: /训练已完成/ }),
      ).toBeInTheDocument();
    },
  );

  it("keeps an admitted request alive when backend status changes to RUNNING", () => {
    mocks.accessAllowed = true;
    mocks.useAiAnalysisStream.mockReturnValue({
      data: "",
      isLoading: true,
      isDone: false,
      error: null,
      operation: null,
    });
    const { rerender } = render(<AIAnalysis />);
    expect(mocks.useAiAnalysisStream).toHaveBeenLastCalledWith(
      "activity-1",
      true,
      0,
      true,
    );
    mocks.reviewQuery.data = { found: true, status: "RUNNING", markdown: "" };
    rerender(<AIAnalysis />);
    expect(mocks.useAiAnalysisStream).toHaveBeenLastCalledWith(
      "activity-1",
      true,
      0,
      true,
    );
    expect(screen.getByText("analyzing")).toBeInTheDocument();
  });

  it("does not report an empty operation replay as analysis failure", () => {
    mocks.accessAllowed = true;
    render(<AIAnalysis />);
    expect(screen.queryByText("analysisFailed")).not.toBeInTheDocument();
    expect(screen.getByText("analyzing")).toBeInTheDocument();
  });

  it("retries a terminal failure inside the card without navigating", () => {
    mocks.accessAllowed = true;
    mocks.reviewQuery.data = { found: true, status: "DEAD", markdown: "" };
    render(<AIAnalysis />);
    expect(screen.getByText("analysisFailed")).toBeInTheDocument();
    expect(mocks.useAiAnalysisStream).toHaveBeenLastCalledWith(
      "activity-1",
      true,
      0,
      false,
    );
    fireEvent.click(screen.getByRole("button", { name: "regenerate" }));
    expect(mocks.useAiAnalysisStream).toHaveBeenLastCalledWith(
      "activity-1",
      true,
      1,
      true,
    );
  });

  beforeEach(() => {
    mocks.accessAllowed = false;
    mocks.consentGranted = true;
    mocks.reviewQuery = {
      data: { found: false, markdown: "" },
      isLoading: false,
      isError: false,
    };
    mocks.useAiAnalysisStream.mockClear();
    mocks.useAiAnalysisStream.mockReturnValue({
      data: "",
      isLoading: false,
      isDone: true,
      error: null,
      operation: null,
    });
  });

  it("renders the managed access slot without starting analysis", () => {
    render(<AIAnalysis />);

    expect(screen.queryByText("regenerate")).not.toBeInTheDocument();
    expect(screen.queryByText("standardMode")).not.toBeInTheDocument();
    expect(screen.queryByText("deepMode")).not.toBeInTheDocument();
    expect(screen.queryByText("emptyHint")).not.toBeInTheDocument();
    expect(mocks.useAiAnalysisStream).toHaveBeenCalledWith(
      "activity-1",
      true,
      0,
      false,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "managed access prompt" }),
    );

    expect(screen.getByRole("dialog")).toHaveTextContent("managed access");
  });

  it("auto-starts the default analysis once for eligible users and shows analyzing instead of empty copy", () => {
    mocks.accessAllowed = true;
    mocks.useAiAnalysisStream.mockReturnValue({
      data: "",
      isLoading: true,
      isDone: false,
      error: null,
      operation: null,
    });

    render(<AIAnalysis />);

    expect(screen.getByText("analyzing")).toBeInTheDocument();
    expect(screen.queryByText("emptyHint")).not.toBeInTheDocument();
    expect(screen.queryByText("regenerate")).not.toBeInTheDocument();
    expect(screen.queryByText("standardMode")).not.toBeInTheDocument();
    expect(screen.queryByText("deepMode")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "managed access prompt" }),
    ).not.toBeInTheDocument();
    expect(mocks.useAiAnalysisStream).toHaveBeenLastCalledWith(
      "activity-1",
      true,
      0,
      true,
    );
    expect(mocks.useAiAnalysisStream).toHaveBeenCalledWith(
      "activity-1",
      true,
      0,
      true,
    );
  });

  it("opens an embedded coach conversation from the preview card", () => {
    mocks.accessAllowed = true;
    mocks.reviewQuery = {
      data: {
        found: true,
        markdown: "## 配速与跑步经济性\n平均配速 5:56/km。",
        status: "SUCCEEDED",
      },
      isLoading: false,
      isError: false,
    };

    render(<AIAnalysis />);

    fireEvent.click(screen.getByRole("button", { name: /配速与跑步经济性/ }));

    expect(screen.getByTestId("activity-coach-thread")).toHaveTextContent(
      "配速与跑步经济性",
    );
    expect(screen.getByRole("button", { name: "send" })).toBeInTheDocument();
  });
});
