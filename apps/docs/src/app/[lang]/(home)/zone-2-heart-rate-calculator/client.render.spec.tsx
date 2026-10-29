import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../../../../../../packages/messages/docs/en.json";
import ja from "../../../../../../../packages/messages/docs/ja.json";
import zhHant from "../../../../../../../packages/messages/docs/zh-hant.json";
import zh from "../../../../../../../packages/messages/docs/zh.json";
import { Zone2HeartRateCalculatorClient } from "./client";
import { EMPTY_ZONE2_INPUTS, type Zone2Inputs } from "./share-inputs";

const messages = { en, zh, ja, "zh-hant": zhHant } as const;

function renderLocale(locale: keyof typeof messages, initial: Zone2Inputs) {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={messages[locale]}
      timeZone="UTC"
    >
      <Zone2HeartRateCalculatorClient initial={initial} hero={<p>hero</p>} />
    </NextIntlClientProvider>,
  );
}

describe("Zone 2 calculator render", () => {
  it("renders an empty scorecard with print and share disabled", () => {
    const html = renderLocale("en", EMPTY_ZONE2_INPUTS);
    expect(html.match(/<h1/g)).toBeNull();
    expect(html).toContain('id="calculator"');
    expect(html).toContain('id="result"');
    expect(html).toContain("disabled");
    expect(html).not.toContain(">Copy<");
    expect(html).not.toContain("114");
    expect(html).not.toContain("132");
  });

  it("renders the max-HR zone bounds", () => {
    const html = renderLocale("en", {
      ...EMPTY_ZONE2_INPUTS,
      maxHr: "190",
    });
    expect(html).toContain("114");
    expect(html).toContain("132");
    expect(html).toContain("60");
    expect(html).toContain("70");
    expect(html).toContain("190");
    expect(html).toContain("/heart-rate-zones-calculator");
    expect(html).toContain("model=mhr");
    expect(html).toContain("maxHr=190");
  });

  it("renders indexed locales with the same zone bounds", () => {
    for (const locale of ["zh", "ja", "zh-hant"] as const) {
      const html = renderLocale(locale, {
        ...EMPTY_ZONE2_INPUTS,
        maxHr: "190",
      });
      expect(html.match(/<h1/g)).toBeNull();
      expect(html).toContain("114");
      expect(html).toContain("132");
      expect(html).not.toContain("zone2HeartRateCalculator");
    }
  });

  it("renders a Karvonen result and prefills the full-zone calculator", () => {
    const html = renderLocale("en", {
      ...EMPTY_ZONE2_INPUTS,
      method: "hrr",
      maxHr: "190",
      restHr: "50",
    });
    expect(html).toContain("134");
    expect(html).toContain("147");
    expect(html).toContain("model=karvonen");
    expect(html).toContain("restHr=50");
  });
});
