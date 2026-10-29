import { SEO_INDEXED_LANGUAGES } from "@/lib/i18n";
import { blogSource } from "@/lib/blog-source";
import {
  llmFreeToolPages,
  llmGuidePages,
  llmProductPages,
} from "@/lib/llms-catalog";
import { localePrefix } from "@/lib/locale-url";

function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  return raw.replace(/\/+$/, "");
}

function markdownFileLink(title: string, url: string, description?: string) {
  const suffix = description ? `: ${description}` : "";
  return `- [${title}](${url})${suffix}`;
}

export const revalidate = false;

// Build date for the llms.txt index. Keep in sync with the geo self-check
// script (scripts/geo-check.mjs) so the file does not drift silently.
const LAST_UPDATED = "2026-10-27";

export async function GET() {
  const siteUrl = getSiteUrl();
  const hasBlogPosts = blogSource.generateParams().length > 0;
  const lines = [
    "# Trainingload.ai",
    "",
    "> Trainingload.ai is a web and mobile endurance training platform for runners, cyclists, triathletes, self-coached athletes, and coaches. It combines reviewed training-plan templates, manual and AI-assisted planning, versioned plan sharing and draft import, completed-workout analysis, PMC load signals, threshold and zone management, provider sync, mobile recording, account-data export, and reviewable AI Coach actions.",
    "",
    `Last updated: ${LAST_UPDATED}.`,
    "",
    "Plans can begin from a reviewed official template, a manual build, or an AI-assisted draft. AI Coach can explain evidence and propose structured changes, but plan and workout mutations remain reviewable before they are applied.",
    "The web and mobile apps share plans, activities, thresholds, AI Coach sessions, notifications, membership, and usage. Mobile adds daily execution and local workout recording; web provides the broadest planning, analysis, and connection-management surfaces.",
    "Primary topics: training load management, plan-versus-actual analysis, official and adaptive endurance training plans, AI endurance coaching, PMC / CTL-ATL-TSB, effective VO2max, thresholds, zones, provider synchronization, and free endurance tools.",
    `Languages: ${SEO_INDEXED_LANGUAGES.join(", ")}`,
    "",
    "## Essential Resources",
    "",
    markdownFileLink(
      "Full Trainingload.ai context",
      `${siteUrl}/llms-full.txt`,
      "Expanded product, tool, and documentation content for agents that need more context.",
    ),
    markdownFileLink(
      "Pricing",
      `${siteUrl}/pricing`,
      "Free, PLUS, and PRO plan details, monthly AI credits, credit packs, and checkout notes.",
    ),
    markdownFileLink(
      "Free training tools",
      `${siteUrl}/tools`,
      "Calculators, file viewers, converters, and primary tool URLs.",
    ),
    markdownFileLink(
      "Training metrics glossary",
      `${siteUrl}/api/docs-markdown/en/metrics`,
      "Markdown documentation for training load, PMC, thresholds, zones, power, heart rate, pace, and physiology.",
    ),
    markdownFileLink(
      "XML sitemap",
      `${siteUrl}/sitemap.xml`,
      "Complete index of public, crawlable pages.",
    ),
    "",
    "## Product and Feature Pages",
    "",
    ...llmProductPages.map((page) =>
      markdownFileLink(page.title, `${siteUrl}${page.path}`, page.description),
    ),
    "",
    "## Product Guides in Markdown",
    "",
    ...llmGuidePages.map((guide) =>
      markdownFileLink(
        guide.title,
        `${siteUrl}${guide.path}`,
        guide.description,
      ),
    ),
    "",
    "## Free Calculators, File Viewers, and Converters",
    "",
    ...llmFreeToolPages.map((tool) =>
      markdownFileLink(tool.title, `${siteUrl}${tool.path}`, tool.description),
    ),
    "",
    "## Localized Entry Points",
    "",
    ...SEO_INDEXED_LANGUAGES.flatMap((lang) => {
      const prefix = localePrefix(lang);
      const items = [
        markdownFileLink(`${lang} homepage`, `${siteUrl}${prefix || "/"}`),
        markdownFileLink(`${lang} tools`, `${siteUrl}${prefix}/tools`),
        markdownFileLink(`${lang} documentation`, `${siteUrl}${prefix}/docs`),
      ];
      if (hasBlogPosts) {
        items.splice(
          2,
          0,
          markdownFileLink(`${lang} blog`, `${siteUrl}${prefix}/blog`),
        );
      }
      return items;
    }),
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}
