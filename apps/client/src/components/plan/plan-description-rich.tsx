"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sanitizeHtmlForBrowser } from "@/lib/browser-sanitize-html";
import { cn } from "@/lib/utils";

/** 是否为 HTML 片段（含实体编码如 &lt;p&gt;）。否则按 Markdown（GFM）解析。 */
export function shouldRenderPlanDescriptionAsHtml(raw: string): boolean {
  const t = raw.trim();
  if (/^<\s*[!?a-z]/i.test(t)) return true;
  if (/^<\s*\/\s*[a-z]/i.test(t)) return true;
  if (/^&lt;\s*\/?\s*[a-z!?]/i.test(t)) return true;
  return false;
}

type Variant = "card" | "sidebar" | "detail";

function shellClassForVariant(
  variant: Variant,
  lineClamp?: 2 | 3,
): string {
  if (variant === "detail") {
    return cn(
      "plan-description-rich prose prose-sm max-w-none dark:prose-invert",
      "break-words text-muted-foreground text-mobile-caption pc:text-xs leading-relaxed",
      "[&_p]:text-mobile-caption [&_li]:text-mobile-caption [&_strong]:text-mobile-caption [&_h1]:!text-mobile-caption [&_h2]:!text-mobile-caption [&_h3]:!text-mobile-caption pc:[&_p]:text-xs pc:[&_li]:text-xs pc:[&_strong]:text-xs pc:[&_h1]:!text-xs pc:[&_h2]:!text-xs pc:[&_h3]:!text-xs",
      "prose-p:my-1 prose-p:first:mt-0 prose-headings:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0",
      "[&_pre]:my-2 [&_pre]:overflow-auto [&_pre]:max-h-48 [&_pre]:text-mobile-caption pc:[&_pre]:text-[11px]",
      "[&_a]:text-muted-foreground [&_a]:underline",
    );
  }

  const clampLines: 2 | 3 =
    lineClamp ??
    (variant === "sidebar" ? 3 : 2);
  const clampClass = clampLines === 2 ? "line-clamp-2" : "line-clamp-3";

  return cn(
    "plan-card-desc-preview prose max-w-none dark:prose-invert",
    variant === "sidebar"
      ? cn(
          "prose-sm text-mobile-caption leading-snug [&_p]:text-mobile-caption [&_li]:text-mobile-caption [&_strong]:font-medium [&_h1]:!text-mobile-caption [&_h2]:!text-mobile-caption [&_h3]:!text-mobile-caption pc:text-xs pc:[&_p]:text-xs pc:[&_li]:text-xs pc:[&_h1]:!text-xs pc:[&_h2]:!text-xs pc:[&_h3]:!text-xs",
          clampClass,
        )
      : cn("prose-sm", clampClass),
    "overflow-hidden break-words text-muted-foreground",
    "prose-p:my-0 prose-headings:my-0 prose-ul:my-0 prose-ol:my-0 prose-li:my-0",
    "[&_pre]:my-0 [&_pre]:overflow-hidden",
    variant === "sidebar"
      ? "[&_pre]:max-h-[4rem] [&_pre]:text-mobile-unit pc:[&_pre]:text-[10px]"
      : "[&_pre]:max-h-[3.25rem] [&_pre]:text-mobile-caption pc:[&_pre]:text-[11px]",
    "[&_a]:text-muted-foreground [&_a]:underline",
  );
}

/**
 * 计划描述 / 目标：支持 HTML（sanitize）或 Markdown（GFM）。
 * `detail`：计划详情页标题下副文案，不截断。
 */
export function PlanDescriptionRich({
  markdown,
  variant = "card",
  lineClamp,
}: {
  markdown: string;
  variant?: Variant;
  /** 截断行数；不传时 card 默认 2 行、sidebar 默认 3 行；detail 不截断 */
  lineClamp?: 2 | 3;
}) {
  const trimmed = markdown.trim();
  const shouldRenderHtml = shouldRenderPlanDescriptionAsHtml(trimmed);
  const [safeHtml, setSafeHtml] = useState("");

  useEffect(() => {
    if (!trimmed || !shouldRenderHtml) {
      setSafeHtml("");
      return;
    }

    let alive = true;
    void sanitizeHtmlForBrowser(trimmed).then((safe) => {
      if (alive) setSafeHtml(safe);
    });
    return () => {
      alive = false;
    };
  }, [shouldRenderHtml, trimmed]);

  if (!trimmed) return null;

  const shellClass = shellClassForVariant(variant, lineClamp);

  if (shouldRenderHtml) {
    return (
      <div
        className={cn(
          shellClass,
          variant !== "detail" && "[&_li]:my-0 [&_ol]:my-0 [&_ul]:my-0",
        )}
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    );
  }

  return (
    <div className={shellClass}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ children }) {
            return (
              <span className="underline decoration-muted-foreground/70">
                {children}
              </span>
            );
          },
        }}
      >
        {trimmed}
      </ReactMarkdown>
    </div>
  );
}
