import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";
import messages from "../../../../../packages/messages/client-core/zh.json";
import { RollingPlanWindowExport } from "./rolling-plan-window-export";
import { getPlanWindowSnapshot, type TrainingPlanDetail } from "@/api/plans";

vi.mock("@/api/plans", () => ({ getPlanWindowSnapshot: vi.fn() }));
it("exports only the explicitly displayed date window and rejects windows above 93 days", async () => {
  const createUrl = vi.fn(() => "blob:window");
  Object.defineProperty(URL, "createObjectURL", {
    value: createUrl,
    configurable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: vi.fn(),
    configurable: true,
  });
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => undefined);
  vi.mocked(getPlanWindowSnapshot).mockResolvedValue({
    payloadVersion: "plan-window-v2",
    snapshotOnly: true,
  } as never);
  const plan = {
    id: "plan",
    planningMode: "ROLLING",
    generatedThrough: "2026-11-29",
    generationCoverage: {
      status: "PARTIAL",
      from: "2026-11-18",
      through: "2026-11-29",
      intervals: [
        { from: "2026-11-18", through: "2026-11-22", weekStart: "2026-11-16" },
      ],
    },
  } as TrainingPlanDetail;
  render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <RollingPlanWindowExport plan={plan} />
    </NextIntlClientProvider>,
  );
  expect(screen.getByLabelText("开始日期")).toHaveValue("2026-11-18");
  fireEvent.change(screen.getByLabelText("结束日期"), {
    target: { value: "2027-03-01" },
  });
  expect(
    screen.getByRole("button", { name: "导出已生成日期窗口" }),
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText("结束日期"), {
    target: { value: "2026-11-29" },
  });
  fireEvent.click(screen.getByRole("button", { name: "导出已生成日期窗口" }));
  await waitFor(() =>
    expect(getPlanWindowSnapshot).toHaveBeenCalledWith(
      "plan",
      "2026-11-18",
      "2026-11-29",
    ),
  );
  expect(createUrl).toHaveBeenCalledTimes(1);
  expect(click).toHaveBeenCalledTimes(1);
  click.mockRestore();
});
