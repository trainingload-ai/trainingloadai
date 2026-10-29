import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import zhMessages from "../../../../../../../packages/messages/client-core/zh.json";
import { explorationFixtures } from "../../../../../e2e/fixtures/exploration-fixtures";
import { TrainingVisualizationCard } from "./training-visualization-card";
import { isTrainingVisualizationV2 } from "@shared/training-exploration";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);

afterEach(cleanup);

describe("exploration cards", () => {
  it("accepts all server-shaped scenarios and renders both signal panels", () => {
    for (const fixture of explorationFixtures())
      expect(isTrainingVisualizationV2(fixture)).toBe(true);
    render(
      <NextIntlClientProvider
        locale="zh"
        timeZone="Asia/Shanghai"
        messages={zhMessages}
      >
        <TrainingVisualizationCard payload={explorationFixtures()[0]} />
      </NextIntlClientProvider>,
    );
    expect(screen.getAllByTestId("exploration-plot")).toHaveLength(2);
    expect(screen.getAllByText("心率 · bpm")[0]).toBeTruthy();
    expect(screen.getAllByText("配速 · min/km")[0]).toBeTruthy();
    expect(screen.getByText(/缺失信号及超过 10 秒/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "叠加展示" }),
    );
    expect(screen.getAllByTestId("exploration-plot")).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole("img"), { key: "ArrowRight" });
    expect(screen.getByRole("tooltip").textContent).toContain("bpm");
    expect(screen.getByRole("tooltip").textContent).toContain("min/km");
    fireEvent.click(
      screen.getByRole("button", { name: "分开展示" }),
    );
    expect(screen.getAllByTestId("exploration-plot")).toHaveLength(2);
  });
  it("renders three axes and gives all measures in the shared tooltip", () => {
    render(
      <NextIntlClientProvider
        locale="zh"
        timeZone="Asia/Shanghai"
        messages={zhMessages}
      >
        <TrainingVisualizationCard payload={explorationFixtures().at(-1)!} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "叠加展示" }),
    );
    expect(screen.getAllByTestId("exploration-plot")).toHaveLength(1);
    expect(screen.getByText("Y3 · 海拔 · m")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("img"), { key: "ArrowRight" });
    const tooltip = screen.getByRole("tooltip").textContent!;
    expect(tooltip).toContain("心率");
    expect(tooltip).toContain("配速");
    expect(tooltip).toContain("海拔");
    expect(tooltip).toContain("min/km");
  });
  it("shows values from keyboard selection and keeps data tables paginated", () => {
    render(
      <NextIntlClientProvider
        locale="zh"
        timeZone="Asia/Shanghai"
        messages={zhMessages}
      >
        <TrainingVisualizationCard payload={explorationFixtures()[1]} />
      </NextIntlClientProvider>,
    );
    const plot = screen.getAllByTestId("exploration-plot").at(-1)!;
    fireEvent.keyDown(within(plot).getByRole("img"), { key: "ArrowRight" });
    expect(within(plot).getByRole("tooltip").textContent).toContain("bpm");
    const card = screen.getAllByTestId("training-exploration-card").at(-1)!;
    const details = card.querySelector("details")!;
    expect(details.querySelectorAll("tbody tr").length).toBe(20);
    fireEvent.click(within(details).getByLabelText("下一页"));
    expect(details.textContent).toContain("2 / 8");
  });
});
