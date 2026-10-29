import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import zh from "../../../../../../../../packages/messages/client-core/zh.json";
import en from "../../../../../../../../packages/messages/client-core/en.json";
import {
  MutationAppliedCard,
  type MutationAppliedToolResult,
} from "./MutationAppliedCard";

const result: MutationAppliedToolResult = {
  kind: "mutation_applied",
  ok: true,
  type: "PLAN_LIFECYCLE",
  riskTier: "HIGH",
  actionId: "receipt",
  summary: "Plan complete: Base.",
  undoUntil: null,
  payload: { action: "complete", title: "Base" },
};
describe("localized lifecycle receipt", () => {
  it.each([
    ["zh", zh, "已完成计划 · Base"],
    ["en", en, "Plan completed · Base"],
  ] as const)(
    "renders persisted structured data in %s",
    (locale, messages, expected) => {
      render(
        <NextIntlClientProvider locale={locale} messages={messages}>
          <MutationAppliedCard result={result} />
        </NextIntlClientProvider>,
      );
      expect(screen.getByText(expected)).toBeVisible();
      expect(screen.queryByText(result.summary)).toBeNull();
    },
  );
  it("retains the summary for legacy receipts without an action payload", () => {
    render(
      <NextIntlClientProvider locale="zh" messages={zh}>
        <MutationAppliedCard result={{ ...result, payload: null }} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(result.summary)).toBeVisible();
  });
  it("renders a competition title instead of the server audit summary", () => {
    render(
      <NextIntlClientProvider locale="zh" messages={zh}>
        <MutationAppliedCard
          result={{
            ...result,
            type: "COMPETITION_EVENT_MUTATION",
            summary: "update competition event 秋季合成骑行测试赛",
            payload: {
              action: "UPDATE",
              event: { title: "秋季合成骑行测试赛" },
            },
          }}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("秋季合成骑行测试赛")).toBeVisible();
    expect(
      screen.queryByText("update competition event 秋季合成骑行测试赛"),
    ).toBeNull();
  });
  it("localizes legacy competition action history without a payload", () => {
    render(
      <NextIntlClientProvider locale="zh" messages={zh}>
        <MutationAppliedCard
          result={{
            ...result,
            type: "COMPETITION_EVENT_MUTATION",
            summary: "create competition event 秋季合成骑行测试赛",
            payload: null,
          }}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("秋季合成骑行测试赛")).toBeVisible();
  });
});
