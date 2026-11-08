import Link from "next/link";
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
    <section id="mcp">
      <div className="home-container home-split">
        <div className="home-split-copy">
          <h2>{t.title}</h2>
          <p className="home-lead">{t.eyebrow}</p>
          <p className="home-copy">{t.description}</p>
          <div className="home-actions">
            <TrackedLink
              href={`${prefix}/features/mcp`}
              eventName="home_mcp_feature_click"
              eventProperties={{ placement: "mcp_showcase" }}
              className="home-button"
            >
              {t.primary}
            </TrackedLink>
            <Link href={`${prefix}/docs/mcp/connect`} className="home-text-link">
              {t.secondary}
            </Link>
          </div>
          <ul className="home-meta-line">
            {t.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>

        <div className="home-frame px-4 py-8 sm:p-7">
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
