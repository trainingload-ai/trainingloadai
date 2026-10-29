import { getTranslations } from "next-intl/server";
import { PricingPlansSection } from "@/components/PricingPlansSection";
import { getPricingCreditLabels } from "@/lib/ai-plan-pricing";
import {
  formatNewUserGiftCredits,
  newUserGiftValues,
} from "@/lib/offer-content";

type PricingPreviewSectionProps = {
  lang: string;
  appUrl: string;
};

export async function PricingPreviewSection({
  lang,
  appUrl,
}: PricingPreviewSectionProps) {
  const [t, tHome] = await Promise.all([
    getTranslations({ locale: lang, namespace: "pricingPage" }),
    getTranslations({ locale: lang, namespace: "home" }),
  ]);
  const creditLabels = getPricingCreditLabels(lang);
  const gift = newUserGiftValues(process.env);
  const newUserGift = {
    days: gift.accessDays,
    credits: formatNewUserGiftCredits(gift.bonusCredits, lang),
  };
  const previewEyebrow = tHome.has("pricingPreview.eyebrow")
    ? tHome("pricingPreview.eyebrow")
    : t("eyebrow");
  const previewTitle = tHome.has("pricingPreview.title")
    ? tHome("pricingPreview.title")
    : t("title");
  const previewSubtitle = tHome.has("pricingPreview.subtitle")
    ? tHome("pricingPreview.subtitle", newUserGift)
    : t("subtitle", newUserGift);

  return (
    <section className="marketing-section w-full bg-secondary/70 text-foreground">
      <div className="marketing-container">
        <div className="mx-auto max-w-3xl text-center">
          <div className="marketing-eyebrow">
            {previewEyebrow}
          </div>
          <h2 className="marketing-title mx-auto mt-3">
            {previewTitle}
          </h2>
          <p className="marketing-copy mx-auto mt-4 max-w-2xl">
            {previewSubtitle}
          </p>
        </div>

        <PricingPlansSection
          appUrl={appUrl}
          creditLabels={creditLabels}
          newUserGift={newUserGift}
        />
      </div>
    </section>
  );
}
