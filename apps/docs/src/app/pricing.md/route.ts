import { getPricingCreditLabels } from "@/lib/ai-plan-pricing";
import {
  formatNewUserGiftCredits,
  newUserGiftValues,
} from "@/lib/offer-content";

function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  return raw.replace(/\/+$/, "");
}

export const revalidate = false;

export async function GET() {
  const siteUrl = getSiteUrl();
  const creditLabels = getPricingCreditLabels("en");
  const gift = newUserGiftValues(process.env);
  const giftCredits = formatNewUserGiftCredits(gift.bonusCredits, "en");
  const lines = [
    "# Pricing - Trainingload.ai",
    "",
    "Last updated: 2026-09-09",
    "",
    "Trainingload.ai offers Free, PLUS, and PRO plans. A paid subscription unlocks the full AI coach and adds AI credits every month. Standard mode is 1x; Deep mode is 3x. Actual credit use depends on context length, cached input, output length, and the models used.",
    "",
    `New-user gift: eligible users who complete account setup receive ${gift.accessDays} days of PLUS access and ${giftCredits} credits. The gift is available once per lifetime and expires with the temporary PLUS access.`,
    "",
    `[Canonical pricing page](${siteUrl}/pricing)`,
    "[Trainingload.ai application](https://app.trainingload.ai/en)",
    "",
    "## Free",
    "- Price: $0/month",
    "- Includes activity uploads and history, training calendar, manual plans, official plan previews and creation, training-load charts, core metrics, and standard zone templates.",
    "- Does not include member-initiated AI coach chat, manual AI activity interpretation, or AI-generated plan changes.",
    `- Eligible new users can receive ${gift.accessDays} days of PLUS access and ${giftCredits} credits after completing setup.`,
    "",
    "## PLUS",
    "- Price: $4.90/month or $41/year",
    `- Credits: ${creditLabels.plus} credits per month`,
    "- Annual billing is charged once, but credits are still issued monthly on the subscription anniversary date.",
    "- Unused subscription credits expire at the end of each monthly credit period and do not roll over.",
    "- Includes full AI coach access, Standard and Deep modes, manual AI activity interpretation, and AI-generated plan actions.",
    "",
    "## PRO",
    "- Price: $9.90/month or $83/year",
    `- Credits: ${creditLabels.pro} credits per month`,
    "- Annual billing is charged once, but credits are still issued monthly on the subscription anniversary date.",
    "- Unused subscription credits expire at the end of each monthly credit period and do not roll over.",
    "- Includes the same AI capabilities as PLUS with a larger monthly credit allowance.",
    "",
    "## Credit packs",
    "- Starter: 5,000 credits for $6.99",
    "- Advanced: 15,000 credits for $17.99",
    "- Professional: 40,000 credits for $39.99",
    "- Credit packs can be purchased and used only while a PLUS or PRO membership is active.",
    "- Credit packs expire 12 calendar months after successful payment and do not extend membership.",
    "- If membership expires, remaining pack credits are locked while their expiration clock continues. They become usable again after resubscribing, if they have not expired.",
    "",
    "## Credit calculation",
    "- Uncached input = max(0, input tokens - cached input tokens).",
    "- Equivalent tokens = uncached input + cached input / 30 + output tokens x 3.",
    "- Credits for one successful action = max(1, ceil(global multiplier x sum(equivalent tokens x model multiplier) / 1000)).",
    "- Standard mode has a 1x model multiplier and Deep mode has a 3x model multiplier.",
    "- Multiple successful model calls within one action are added together before rounding once. Zero actual usage costs zero credits.",
    "- A conversation turn has no fixed credit cost because context, tool calls, output length, and model tier vary.",
    "",
    "## Usage and balance rules",
    "- Member-initiated coach messages, edits followed by regeneration, manual activity interpretation, and AI plan generation or adjustment consume credits.",
    "- Automatic daily, weekly, and monthly reviews and automatic post-import analysis are paid by Trainingload.ai and do not consume user credits.",
    "- A paid AI action may finish even if its actual cost makes the balance negative. Another member-initiated paid AI action cannot start until the balance is positive and any debt is cleared.",
    "- Credits are consumed by earliest expiration first. New grants offset outstanding debt before becoming available.",
    "",
    "## Refunds and billing",
    "- Refunded or charged-back purchases have their related credits revoked. Credits already consumed may create account debt.",
    "- Credits are not money and cannot be transferred, withdrawn, or redeemed for cash.",
    "- Web checkout may offer Waffo Pancake and/or Creem according to availability. iOS subscriptions are processed by Apple.",
    "- Cancellation stops future renewal; access generally continues through the paid period unless checkout terms or applicable law say otherwise.",
    "- Final charge, currency, renewal terms, and refund eligibility are confirmed by the payment provider at checkout.",
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "x-robots-tag": "noindex, follow",
      link: `<${siteUrl}/pricing>; rel="canonical"`,
    },
  });
}
