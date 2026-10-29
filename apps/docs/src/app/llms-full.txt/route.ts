import { getLLMText, source } from "@/lib/source";
import {
  llmFreeToolPages,
  llmProductPages,
  localizedPageUrls,
} from "@/lib/llms-catalog";
import { i18n } from "@/lib/i18n";
import { getRaceTimeLlmText } from "@/lib/race-time-llm";
import { getRunningPaceLlmText } from "@/lib/running-pace-llm";
import {
  getHeartRateZonesLlmText,
  getMaxHeartRateLlmText,
  getZone2HeartRateLlmText,
} from "@/lib/heart-rate-llm";
import { getPowerZonesLlmText } from "@/lib/power-zones-llm";

function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  return raw.replace(/\/+$/, "");
}

export const revalidate = false;

const LAST_UPDATED = "2026-10-27";

function demoteMarkdownHeadings(markdown: string, depth: number) {
  return markdown.replace(/^(#{1,6})(?=\s)/gm, (heading) =>
    "#".repeat(Math.min(6, heading.length + depth)),
  );
}

export async function GET() {
  const siteUrl = getSiteUrl();
  const productOverview = [
    "# Trainingload.ai Full Context",
    "> Trainingload.ai is a web and mobile endurance training platform for runners, cyclists, triathletes, self-coached athletes, and coaches. It combines reviewed training-plan templates, manual and AI-assisted planning, versioned plan sharing and draft import, completed-workout analysis, PMC load signals, threshold and zone management, provider sync, mobile recording, account-data export, and reviewable AI Coach actions.",
    `Last updated: ${LAST_UPDATED}.`,
    "Use the shorter [llms.txt index](/llms.txt) when the complete documentation corpus is unnecessary.",
    "## Product Model",
    "- Plans can start from a reviewed official template, a manual build, or an AI-assisted draft.",
    "- Plans can be shared through unlisted, version-aware links and imported as separate drafts without changing the source plan.",
    "- Completed activities can come from file uploads, supported provider connections, or mobile recording, then feed the same analysis and plan-versus-actual workflow.",
    "- Training analysis combines workout evidence with PMC / CTL-ATL-TSB, thresholds, zones, effective VO2max, current state, and plan context.",
    "- AI Coach can explain evidence and propose structured plan or workout changes; mutations remain reviewable before application.",
    "- Web and mobile share plans, activities, profile values, thresholds, AI Coach sessions, notifications, membership, and usage.",
    "- Account controls include privacy-aware asynchronous data exports and an explicit permanent-deletion workflow.",
    "## Machine-Readable Resources",
    `- [Pricing](${siteUrl}/pricing): Free, PLUS, PRO, monthly AI credits, credit packs, checkout, and subscription notes.`,
    `- [Free tools](${siteUrl}/tools): Calculators, file viewers, converters, and primary URLs.`,
    `- [Training glossary](${siteUrl}/api/docs-markdown/en/metrics): Processed Markdown for training metrics.`,
  ].join("\n\n");
  const productText = llmProductPages.map((page) =>
    [
      `### ${page.title}`,
      page.description,
      `[Primary page](${siteUrl}${page.path})`,
      "Localized pages:",
      ...localizedPageUrls(siteUrl, page.path).map(
        ({ lang, url }) => `- [${lang}](${url})`,
      ),
    ].join("\n\n"),
  );
  const [
    raceContext,
    paceContext,
    heartRateZonesContext,
    zone2Context,
    maxHeartRateContext,
    powerZonesContext,
  ] =
    await Promise.all([
      getRaceTimeLlmText(),
      getRunningPaceLlmText(),
      getHeartRateZonesLlmText(),
      getZone2HeartRateLlmText(),
      getMaxHeartRateLlmText(),
      getPowerZonesLlmText(),
    ]);
  const toolText = llmFreeToolPages.map((tool) =>
    [
      `### ${tool.title}`,
      tool.description,
      `[Primary page](${siteUrl}${tool.path})`,
      "Localized pages:",
      ...localizedPageUrls(siteUrl, tool.path).map(
        ({ lang, url }) => `- [${lang}](${url})`,
      ),
      ...(tool.path === "/race-time-predictor" ? [raceContext] : []),
      ...(tool.path === "/running-pace-calculator" ? [paceContext] : []),
      ...(tool.path === "/heart-rate-zones-calculator"
        ? [heartRateZonesContext]
        : []),
      ...(tool.path === "/zone-2-heart-rate-calculator" ? [zone2Context] : []),
      ...(tool.path === "/max-heart-rate-calculator"
        ? [maxHeartRateContext]
        : []),
      ...(tool.path === "/power-zones-calculator"
        ? [powerZonesContext]
        : []),
    ].join("\n\n"),
  );
  const scan = source
    .getPages(i18n.defaultLanguage)
    .map((page) => getLLMText(page, siteUrl));
  const scanned = await Promise.all(scan);

  return new Response(
    [
      productOverview,
      "## Product and Feature Pages",
      ...productText,
      "## Free Calculators, File Viewers, and Converters",
      ...toolText,
      "## English Documentation",
      ...scanned.map((page) => demoteMarkdownHeadings(page, 2)),
    ].join("\n\n"),
    {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    },
  );
}
