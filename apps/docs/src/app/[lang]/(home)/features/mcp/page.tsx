import messages from "@trainingloadai/messages/docs-copy/mcp-feature.json";
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

type McpFeatureLocale =
  | "en"
  | "zh"
  | "zh-hant"
  | "ja"
  | "ko"
  | "de"
  | "fr"
  | "es"
  | "it"
  | "pt-BR";

type McpFeatureCopy = {
  title: string;
  description: string;
  eyebrow: string;
  connect: string;
  docs: string;
  supported: string;
  contractEyebrow: string;
  contractTitle: string;
  contractText: string;
  groups: [string, string][];
  workflowEyebrow: string;
  workflowTitle: string;
  workflowText: string;
  workflow: [string, string, string][];
  recipes: string;
  safetyTitle: string;
  safetyText: string;
  safety: string[];
  finalTitle: string;
  finalText: string;
};

const copy: Record<McpFeatureLocale, McpFeatureCopy> = messages as Record<McpFeatureLocale, McpFeatureCopy>;

function getMcpCopy(lang: string): McpFeatureCopy {
  return copy[lang as McpFeatureLocale] ?? copy.en;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const prefix = localePrefix(lang);
  const localized = getMcpCopy(lang);
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
  const t = getMcpCopy(lang);

  return (
    <div className="bg-neutral-950 text-white">
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
    </div>
  );
}
