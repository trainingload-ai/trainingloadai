import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import messages from "../../../../../../../packages/messages/client-core/zh.json";
import { CoachStructuredToolSkeleton } from "./coach-structured-card-skeletons";

afterEach(cleanup);

function renderSkeleton(toolName: string) {
  return render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <CoachStructuredToolSkeleton toolName={toolName} />
    </NextIntlClientProvider>,
  );
}

describe("structured tool loading", () => {
  it.each(["AskUserQuestion", "ask_user_question", "activity.recent"])(
    "does not insert a result placeholder for %s",
    (name) => {
      const { container } = renderSkeleton(name);
      expect(container).toBeEmptyDOMElement();
    },
  );

  it.each([
    "PresentCoachPlanDraft",
    "present_coach_plan_draft",
    "coach_plan_draft",
  ])("retains the plan preview placeholder for %s", (name) => {
    renderSkeleton(name);
    expect(screen.getByRole("status")).toBeVisible();
  });
});
