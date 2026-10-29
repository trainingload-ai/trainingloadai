import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { TrackedLink } from "@/components/TrackedLink";
import { McpTerminalDemo } from "./McpTerminalDemo";
import { getMcpTerminalCopy } from "./mcp-terminal-copy";

const copy = {
  en: {
    eyebrow: "TrainingLoad MCP",
    title: "Your training data does not have to stay inside TrainingLoad.",
    description:
      "Connect once to query your TrainingLoad plans, activities, load, and race information from ChatGPT, Codex, Claude, Cursor, or VS Code. AI can read this data but cannot change it, and every query and response stays visible.",
    primary: "Explore MCP",
    secondary: "Connection guide",
    points: ["24 read-only tools", "Visible tool calls", "Revocable access"],
  },
  zh: {
    eyebrow: "TrainingLoad MCP",
    title: "训练数据，不必只留在 TrainingLoad 里。",
    description:
      "连接一次后，就能在 ChatGPT、Codex、Claude、Cursor 或 VS Code 中查询 TrainingLoad 里的计划、活动、负荷和比赛信息。AI 只能读取，不能替你修改；每次查了什么、返回了什么都清楚可见。",
    primary: "了解 MCP",
    secondary: "查看连接指南",
    points: ["24 个只读工具", "工具调用全程可见", "授权随时可撤销"],
  },
} as const;

export function HomeMcpShowcase({
  lang,
  prefix,
}: {
  lang: string;
  prefix: string;
}) {
  const t = lang === "zh" ? copy.zh : copy.en;

  return (
    <section
      id="mcp"
      className="marketing-section bg-background text-foreground"
    >
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)] lg:items-center lg:gap-14">
        <div>
          <div className="marketing-eyebrow font-mono">{t.eyebrow}</div>
          <h2 className="font-display mt-3 max-w-xl text-balance text-3xl font-bold leading-[1.08] tracking-[-0.025em] md:text-[2.5rem]">
            {t.title}
          </h2>
          <p className="mt-4 max-w-lg text-[15px] leading-7 text-muted-foreground md:text-base">
            {t.description}
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <TrackedLink
              href={`${prefix}/features/mcp`}
              eventName="home_mcp_feature_click"
              eventProperties={{ placement: "mcp_showcase" }}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-control bg-brand px-5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t.primary}
              <ArrowRight className="size-4" aria-hidden="true" />
            </TrackedLink>
            <Link
              href={`${prefix}/docs/mcp/connect`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-control border border-input bg-card px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t.secondary}
              <ExternalLink className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-5 text-xs text-muted-foreground">
            {t.points.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <span
                  className="size-1.5 rounded-full bg-brand"
                  aria-hidden="true"
                />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative isolate -mx-4 overflow-hidden rounded-none px-4 py-8 sm:mx-0 sm:rounded-overlay sm:p-7">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--brand) 46%, transparent) 1px, transparent 1.35px)",
              backgroundSize: "24px 24px",
              maskImage:
                "radial-gradient(ellipse 118% 112% at 0% 100%, #000 0%, rgba(0,0,0,0.96) 18%, rgba(0,0,0,0.72) 40%, rgba(0,0,0,0.34) 64%, transparent 88%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 118% 112% at 0% 100%, #000 0%, rgba(0,0,0,0.96) 18%, rgba(0,0,0,0.72) 40%, rgba(0,0,0,0.34) 64%, transparent 88%)",
            }}
          />
          <McpTerminalDemo
            copy={getMcpTerminalCopy(lang)}
            href={`${prefix}/features/mcp`}
            variant="compact"
          />
        </div>
      </div>
    </section>
  );
}
