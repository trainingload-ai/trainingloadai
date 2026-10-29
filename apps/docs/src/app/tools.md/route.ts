import { llmFreeToolPages, localizedPageUrls } from "@/lib/llms-catalog";

function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  return raw.replace(/\/+$/, "");
}

export const revalidate = false;

export async function GET() {
  const siteUrl = getSiteUrl();
  const lines = [
    "# Free Training Tools - Trainingload.ai",
    "",
    "Last updated: 2026-08-22",
    "",
    "Trainingload.ai provides free endurance training calculators, a local FIT file viewer, and file converters for runners, cyclists, triathletes, coaches, developers, and self-coached athletes. These tools support training load management, threshold estimation, zones, race-performance interpretation, and activity-file inspection.",
    "",
    `[Tools hub](${siteUrl}/tools)`,
    `[Related product context](${siteUrl}/training-load)`,
    `[Training glossary](${siteUrl}/api/docs-markdown/en/metrics)`,
    "",
    "## Tools",
    "",
    ...llmFreeToolPages.flatMap((tool) => [
      `### ${tool.title}`,
      tool.description,
      `[Primary page](${siteUrl}${tool.path})`,
      "Localized pages:",
      ...localizedPageUrls(siteUrl, tool.path).map(
        ({ lang, url }) => `- [${lang}](${url})`,
      ),
      "",
    ]),
    "## How these tools fit Trainingload.ai",
    "",
    "- Threshold calculators help set FTP, CP, LTHR, VDOT, VO2 max, power zones, and heart-rate zones.",
    "- The FIT File Viewer inspects Garmin FIT identity, summaries, CRC integrity, and decoded messages locally without uploading private file data.",
    "- File converters help athletes work with GPX, FIT, and TCX activity data before deeper analysis.",
    "- Product pages connect tool outputs back to plans, completed workouts, training load, PMC, zones, and AI coach review.",
    "- Glossary pages explain the terms behind the tools: training load, PMC, CTL, ATL, TSB, FTP, CP, LTHR, and VO2 Max.",
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "x-robots-tag": "noindex, follow",
      link: `<${siteUrl}/tools>; rel="canonical"`,
    },
  });
}
