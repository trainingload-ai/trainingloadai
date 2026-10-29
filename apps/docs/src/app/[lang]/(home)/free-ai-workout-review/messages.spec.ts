import { describe, expect, it } from "vitest";
import { SEO_INDEXED_LANGUAGES } from "@/lib/i18n";
import de from "../../../../../../../packages/messages/docs/de.json";
import en from "../../../../../../../packages/messages/docs/en.json";
import es from "../../../../../../../packages/messages/docs/es.json";
import fr from "../../../../../../../packages/messages/docs/fr.json";
import itMessages from "../../../../../../../packages/messages/docs/it.json";
import ja from "../../../../../../../packages/messages/docs/ja.json";
import ko from "../../../../../../../packages/messages/docs/ko.json";
import ptBR from "../../../../../../../packages/messages/docs/pt-BR.json";
import zhHant from "../../../../../../../packages/messages/docs/zh-hant.json";
import zh from "../../../../../../../packages/messages/docs/zh.json";

const messages = {
  de,
  en,
  es,
  fr,
  it: itMessages,
  ja,
  ko,
  "pt-BR": ptBR,
  zh,
  "zh-hant": zhHant,
};

describe("free AI workout review messages", () => {
  it("provides a complete message contract for every indexed locale", () => {
    for (const lang of SEO_INDEXED_LANGUAGES) {
      const copy = messages[lang].freeAiWorkoutReview;
      expect(messages[lang].commonLinks.pricing.length).toBeGreaterThan(1);
      expect(messages[lang].nav.freeAiReview.length).toBeGreaterThan(4);
      expect(copy.metadata.title.length).toBeGreaterThan(10);
      expect(copy.title.length).toBeGreaterThan(10);
      expect(copy.form.submit.length).toBeGreaterThan(2);
      expect(copy.result.cta.length).toBeGreaterThan(5);
      expect(copy.quota.personalRemaining).toContain("{remaining}");
      expect(copy.quota.personalRemaining).toContain("{total}");
      expect(copy.form.replace.length).toBeGreaterThan(2);
      expect(copy.signup.kicker.length).toBeGreaterThan(2);
      expect(copy.signup.title.length).toBeGreaterThan(10);
      expect(copy.signup.description.length).toBeGreaterThan(20);
      expect(copy.signup.cta.length).toBeGreaterThan(5);
      expect(copy.errors.visitorLimit).toContain("{recoveryTime}");
      expect(copy.errors.networkLimit).toContain("{recoveryTime}");
      expect(copy.errors.sharedLimit).toContain("{recoveryTime}");
      expect(copy.errors.activityLimit).toContain("{recoveryTime}");
      expect(copy.quota.remainingOnly).toContain("{remaining}");
      expect(copy.quota.personalCountdown).toContain("{countdown}");
      expect(copy.quota.sharedCountdown).toContain("{countdown}");
      expect(copy.quota.personalRolling.length).toBeGreaterThan(10);
      expect(copy.quota.sharedRolling.length).toBeGreaterThan(10);
      expect(copy.quota.exhausted.length).toBeGreaterThan(10);
      expect(copy.route.interactiveLabel.length).toBeGreaterThan(10);
      expect(copy.faq).toHaveLength(12);
      expect(new Set(copy.faq.map((item) => item.question)).size).toBe(12);
      expect(copy.howTo.steps).toHaveLength(3);
    }
  });

  it("does not silently collapse the primary UI to English fallbacks", () => {
    const localized = SEO_INDEXED_LANGUAGES.map(
      (lang) => messages[lang].freeAiWorkoutReview,
    );
    // Every indexed locale must carry its own copy: a duplicate here means one
    // locale fell back to another's strings.
    const distinct = SEO_INDEXED_LANGUAGES.length;
    expect(new Set(localized.map((copy) => copy.title)).size).toBe(distinct);
    expect(new Set(localized.map((copy) => copy.form.submit)).size).toBe(
      distinct,
    );
    expect(new Set(localized.map((copy) => copy.stages.admission)).size).toBe(
      distinct,
    );
    expect(
      new Set(localized.map((copy) => copy.metadata.keywords[0])).size,
    ).toBe(distinct);
    expect(new Set(localized.map((copy) => copy.route.trendsTitle)).size).toBe(
      distinct,
    );
    expect(new Set(localized.map((copy) => copy.howTo.title)).size).toBe(
      distinct,
    );
    expect(new Set(localized.map((copy) => copy.faqTitle)).size).toBe(distinct);
  });
});
