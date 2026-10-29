import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CoachSessionListItem } from "@/api/ai-coach";
import { CoachHistoryFullPageSessionRow } from "./CoachHistoryFullPageSessionRow";

const session: CoachSessionListItem = {
  id: "sid-1",
  title: "现在正常吗",
  updatedAt: "2026-09-19T07:57:26.000Z",
  pinnedAt: null,
  lastMessagePreview: "现在正常吗",
  lastReplyPreview: "目前恢复正常，可以按计划训练。负荷也不高。",
};

function renderRow(
  overrides: Partial<
    ComponentProps<typeof CoachHistoryFullPageSessionRow>
  > = {},
) {
  return render(
    <CoachHistoryFullPageSessionRow
      active={false}
      deleteAriaLabel="删除"
      deletePending={false}
      editAriaLabel="编辑标题"
      onDelete={vi.fn()}
      onEdit={vi.fn()}
      onOpen={vi.fn()}
      onTogglePin={vi.fn()}
      pinAriaLabel="置顶"
      replyPreview="目前恢复正常，可以按计划训练。负荷也不高。"
      session={session}
      title="现在正常吗"
      unpinAriaLabel="取消置顶"
      {...overrides}
    />,
  );
}

describe("CoachHistoryFullPageSessionRow", () => {
  it("shows the title and a two-line assistant reply preview", () => {
    renderRow();

    expect(screen.getByText("现在正常吗")).toBeInTheDocument();
    expect(
      screen.getByText("目前恢复正常，可以按计划训练。负荷也不高。"),
    ).toHaveClass("line-clamp-2");
  });

  it("labels pin, edit, and delete with localized accessible names used as tooltips", () => {
    renderRow();

    expect(screen.getByRole("button", { name: "置顶" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "编辑标题" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
  });
});
