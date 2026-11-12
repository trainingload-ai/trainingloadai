import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AbstractIntlMessages } from "next-intl";
import { selectClientMessages } from "./client-messages";

const english = JSON.parse(
  readFileSync(
    new URL("../../../../packages/messages/docs/en.json", import.meta.url),
    "utf8",
  ),
) as AbstractIntlMessages;

describe("client translation payloads", () => {
  it("keeps global navigation and error UI without sending page dictionaries", () => {
    const messages = selectClientMessages(english);
    expect(messages.nav).toEqual(english.nav);
    expect(messages.SiteError).toEqual(english.SiteError);
    expect(messages.runningPlanPages).toEqual({
      labels: (english.runningPlanPages as AbstractIntlMessages).labels,
    });
    expect(messages.vo2MaxCalculator).toBeUndefined();
    expect(messages.home).toBeUndefined();
    expect(Buffer.byteLength(JSON.stringify(messages))).toBeLessThan(12_000);
  });

  it("supplies nested tool copy without including sibling calculators", () => {
    const messages = selectClientMessages(english, [
      "powerZonesCalculator.client",
      "calculatorProduct",
    ]);
    expect(messages.powerZonesCalculator).toEqual({
      client: (english.powerZonesCalculator as AbstractIntlMessages).client,
    });
    expect(messages.calculatorProduct).toEqual(english.calculatorProduct);
    expect(messages.converterDirections).toBeUndefined();
  });

  it("retains array values and does not mutate the cached source dictionary", () => {
    const before = JSON.stringify(english);
    const messages = selectClientMessages(english, [
      "runningPlanPages",
      "runningPlanPages.labels",
      "home.faq.items",
    ]);
    expect((messages.home as AbstractIntlMessages).faq).toEqual({
      items: (
        (english.home as AbstractIntlMessages).faq as AbstractIntlMessages
      ).items,
    });
    expect(JSON.stringify(english)).toBe(before);
    expect(messages.runningPlanPages).not.toBe(english.runningPlanPages);
  });

  it("fails explicitly when a route requests an unknown namespace", () => {
    expect(() => selectClientMessages(english, ["unknownCalculator"])).toThrow(
      "Missing client message namespace: unknownCalculator",
    );
  });
});
