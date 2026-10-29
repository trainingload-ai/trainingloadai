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
    expect(mocks.useAiAnalysisStream).toHaveBeenCalledTimes(1);
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
