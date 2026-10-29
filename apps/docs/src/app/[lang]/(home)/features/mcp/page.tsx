import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ExternalLink,
  LockKeyhole,
  TerminalSquare,
} from "lucide-react";
import { absoluteAlternatesForPath, localePrefix } from "@/lib/locale-url";
import { McpTerminalDemo } from "../../_components/McpTerminalDemo";
import { getMcpTerminalCopy } from "../../_components/mcp-terminal-copy";

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai"
  ).replace(/\/+$/, "");
}

const clients = [
  "ChatGPT",
  "Codex",
  "Claude Code",
  "Claude Desktop",
  "Cursor",
  "VS Code",
  "opencode",
];

const copy = {
  en: {
    title: "Your AI can read your training. You can see exactly how.",
    description:
      "Connect TrainingLoad to your AI client through a read-only, OAuth-protected MCP server. Ask a real training question, inspect every tool call, and verify the conclusion against returned data.",
    eyebrow: "TrainingLoad MCP",
    connect: "Connect MCP",
    docs: "Read the docs",
    supported: "Works with",
    contractEyebrow: "A product surface, not a raw API",
    contractTitle: "24 bounded tools. Three resources. Three reusable prompts.",
    contractText:
      "The server prefers an aggregate snapshot, then exposes narrower detail only when the question needs it. Every list has a time bound, a limit, and an opaque cursor.",
    groups: [
      ["Current state", "Snapshot, readiness indicators, and load series"],
      [
        "Progress",
        "Period comparison, sport breakdown, activity statistics, consistency, fitness, zones, and bests",
      ],
      [
        "Execution",
        "Activity zones and splits, plan summaries, adherence, and competition detail",
      ],
      ["Connections", "Sync readiness plus optional health context"],
    ],
    workflowEyebrow: "From connection to evidence",
    workflowTitle: "Add one URL, approve the data you want, then ask normally.",
    workflowText:
      "The client discovers OAuth and tools from the server. TrainingLoad keeps authorization and data boundaries on the server, while every answer remains inspectable in the conversation.",
    workflow: [
      [
        "01",
        "Add the server",
        "Use the same remote URL in any supported client.",
      ],
      ["02", "Review consent", "Approve read scopes; health remains separate."],
      [
        "03",
        "Ask a real question",
        "The client selects the smallest useful tool path.",
      ],
      [
        "04",
        "Verify the answer",
        "Inspect calls, ranges, returned facts, and missing data.",
      ],
    ],
    recipes: "See native prompts, resources, and tool paths",
    safetyTitle: "Private by construction",
    safetyText:
      "OAuth scopes are checked when tools are listed and again when they execute. Results exclude direct identity fields, raw sensor streams, precise routes, credentials, and complete FIT data.",
    safety: [
      "Read-only tools; no hidden write path",
      "Current athlete only; opaque IDs are user-scoped",
      "Untrusted notes are sanitized and never treated as instructions",
      "Schema validation, output budgets, timeouts, limits, audit, and traces",
    ],
    finalTitle: "Connect once. Ask in the client you already use.",
    finalText:
      "The same endpoint works across supported MCP clients. Health access remains optional and can be revoked with the rest of the connection from your account.",
  },
  zh: {
    title: "让你的 AI 读懂训练，也让你看清它是怎么得出结论的。",
    description:
      "通过只读、OAuth 保护的 MCP 服务，把 TrainingLoad 连接到你的 AI 客户端。提出真实训练问题，查看每一次工具调用，再用返回数据验证结论。",
    eyebrow: "TrainingLoad MCP",
    connect: "配置 MCP",
    docs: "查看文档",
    supported: "支持客户端",
    contractEyebrow: "不是裸 API，而是完整产品能力",
    contractTitle: "24 个有边界的工具，3 个 Resources，3 个可复用 Prompts。",
    contractText:
      "服务优先返回聚合快照，只有问题确实需要时才调用更细的工具。所有列表都有限定时间窗、limit 和 opaque cursor。",
    groups: [
      ["当前状态", "训练快照、readiness 指标与负荷时间序列"],
      [
        "进展变化",
        "周期比较、项目拆分、活动统计、一致性、体能趋势、区间与最佳成绩",
      ],
      ["计划执行", "活动 zones/splits、计划总结、完成率与比赛详情"],
      ["连接状态", "同步 readiness 与可选健康背景"],
    ],
    workflowEyebrow: "从连接到证据",
    workflowTitle: "添加一个地址，确认数据权限，然后像平常一样提问。",
    workflowText:
      "客户端从服务发现 OAuth 和工具。TrainingLoad 在服务端守住授权和数据边界，同时让每个答案都能在对话中核验。",
    workflow: [
      ["01", "添加服务", "所有支持的客户端都使用同一个远程地址。"],
      ["02", "确认授权", "批准只读 scopes；健康权限始终单独选择。"],
      ["03", "提出真实问题", "客户端选择能回答问题的最小工具组合。"],
      ["04", "核验答案", "查看调用、日期范围、返回事实与缺失数据。"],
    ],
    recipes: "查看原生 Prompts、Resources 与工具路径",
    safetyTitle: "从设计上保护隐私",
    safetyText:
      "OAuth scope 在工具列出时检查一次，执行时再次做权威校验。结果不包含直接身份字段、原始传感器流、精确路线、凭证或完整 FIT 数据。",
    safety: [
      "全部只读，没有隐藏写入路径",
      "仅当前运动员，opaque ID 绑定用户",
      "清理不可信备注，绝不把它当作指令",
      "Schema 校验、输出预算、超时、限流、审计与 tracing",
    ],
    finalTitle: "连接一次，就在你已经使用的客户端里提问。",
    finalText:
      "同一个端点适用于所有支持的 MCP 客户端。健康数据始终可选，也可以和整条连接一起从账号中撤销。",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const prefix = localePrefix(lang);
  const localized = lang === "zh" ? copy.zh : copy.en;
  return {
    title: `TrainingLoad MCP | ${localized.title}`,
    description: localized.description,
    alternates: {
      canonical: `${siteUrl()}${prefix}/features/mcp`,
      languages: absoluteAlternatesForPath(siteUrl(), "/features/mcp"),
    },
    openGraph: {
      title: `TrainingLoad MCP | ${localized.title}`,
      description: localized.description,
      type: "website",
      url: `${siteUrl()}${prefix}/features/mcp`,
    },
  };
}

export default async function McpFeaturePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const prefix = localePrefix(lang);
  const t = lang === "zh" ? copy.zh : copy.en;

  return (
    <main className="bg-neutral-950 text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto grid min-h-[680px] max-w-[1440px] lg:grid-cols-[0.42fr_0.58fr]">
          <div className="flex flex-col justify-center border-white/10 px-5 py-12 md:py-16 sm:px-10 lg:border-r lg:px-14 xl:px-20">
            <div className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
              {t.eyebrow}
            </div>
            <h1 className="mt-6 max-w-xl text-balance text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl xl:text-6xl">
              {t.title}
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-neutral-400 sm:text-lg">
              {t.description}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={`${prefix}/docs/mcp/connect`}
                className="inline-flex h-11 items-center gap-2 rounded-compact bg-emerald-400 px-5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400"
              >
                {t.connect}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link
                href={`${prefix}/docs/mcp`}
                className="inline-flex h-11 items-center gap-2 rounded-compact border border-white/15 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                {t.docs}
                <ExternalLink className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="mt-12 border-t border-white/10 pt-6">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                {t.supported}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {clients.map((client) => (
                  <span
                    key={client}
                    className="rounded-compact border border-white/10 px-2.5 py-1 font-mono text-xs text-neutral-300"
                  >
                    {client}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div
            className="flex items-center px-4 py-12 sm:px-8 lg:px-12"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.09) 1px, transparent 0)",
              backgroundSize: "24px 24px",
            }}
          >
            <McpTerminalDemo
              copy={getMcpTerminalCopy(lang)}
              href={`${prefix}/docs/mcp/connect`}
              className="mx-auto w-full max-w-3xl"
            />
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 px-5 py-12 md:py-16 sm:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.42fr_0.58fr] lg:gap-16">
            <div>
              <div className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
                {t.workflowEyebrow}
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">
                {t.workflowTitle}
              </h2>
              <p className="mt-5 text-base leading-7 text-neutral-400">
                {t.workflowText}
              </p>
              <Link
                href={`${prefix}/docs/mcp/use-cases`}
                className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400"
              >
                {t.recipes}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="border-l border-t border-white/10 sm:grid sm:grid-cols-2">
              {t.workflow.map(([number, title, detail]) => (
                <article
                  key={number}
                  className="min-h-48 border-b border-r border-white/10 p-6"
                >
                  <div className="font-mono text-xs text-emerald-400">
                    {number}
                  </div>
                  <h3 className="mt-7 text-lg font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-neutral-400">
                    {detail}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 px-5 py-12 md:py-16 sm:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <div className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
              {t.contractEyebrow}
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">
              {t.contractTitle}
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-400">
              {t.contractText}
            </p>
          </div>
          <div className="mt-12 grid border-l border-t border-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {t.groups.map(([title, detail], index) => (
              <article
                key={title}
                className="min-h-44 border-b border-r border-white/10 p-6"
              >
                <div className="font-mono text-xs text-emerald-400">
                  0{index + 1}
                </div>
                <h3 className="mt-6 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  {detail}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 px-5 py-12 md:py-16 sm:px-10">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.42fr_0.58fr] lg:gap-16">
          <div>
            <LockKeyhole
              className="size-7 text-emerald-400"
              aria-hidden="true"
            />
            <h2 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">
              {t.safetyTitle}
            </h2>
            <p className="mt-5 text-base leading-7 text-neutral-400">
              {t.safetyText}
            </p>
          </div>
          <div className="border-t border-white/10">
            {t.safety.map((item) => (
              <div
                key={item}
                className="flex gap-4 border-b border-white/10 py-5 text-sm leading-6 text-neutral-200"
              >
                <Check
                  className="mt-0.5 size-4 shrink-0 text-emerald-400"
                  aria-hidden="true"
                />
                {item}
              </div>
            ))}
            <Link
              href={`${prefix}/docs/mcp/security`}
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400"
            >
              {t.docs}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="px-5 py-12 md:py-16 sm:px-10">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 border border-white/10 bg-white/[0.025] p-7 sm:p-10 lg:flex-row lg:items-center">
          <div className="max-w-3xl">
            <TerminalSquare
              className="size-6 text-emerald-400"
              aria-hidden="true"
            />
            <h2 className="mt-5 text-2xl font-black tracking-tight sm:text-4xl">
              {t.finalTitle}
            </h2>
            <p className="mt-4 text-sm leading-6 text-neutral-400 sm:text-base">
              {t.finalText}
            </p>
          </div>
          <Link
            href={`${prefix}/docs/mcp/connect`}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-compact bg-emerald-400 px-5 text-sm font-semibold text-neutral-950 hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400"
          >
            {t.connect}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  );
}
