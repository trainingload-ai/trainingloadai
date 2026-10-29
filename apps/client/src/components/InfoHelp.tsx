"use client";
import React from "react";
import { HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogTrigger,
} from "@/components/ui/adaptive-dialog";
import { sanitizeHtmlForBrowser } from "@/lib/browser-sanitize-html";
import { marked } from "marked";

interface InfoHelpProps {
  slug: string;
  title?: string;
  size?: "sm" | "md";
}

export const InfoHelp: React.FC<InfoHelpProps> = ({
  slug,
  title,
  size = "sm",
}) => {
  const t = useTranslations("SharedUI");
  const [open, setOpen] = React.useState(false);
  const [html, setHtml] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || html) return;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/metrics/${slug}.md`);
        if (!res.ok) throw new Error(`Failed to load ${slug}.md`);
        const md = await res.text();
        const parsed = marked.parse(md, { async: false }) as string;
        const safe = await sanitizeHtmlForBrowser(parsed);
        if (alive) setHtml(safe);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Load failed";
        if (alive) setError(message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, slug, html]);

  const iconClass =
    size === "sm"
      ? "size-3.5 text-muted-foreground hover:text-foreground cursor-pointer"
      : "size-4 text-muted-foreground hover:text-foreground cursor-pointer";

  return (
    <AdaptiveDialog open={open} onOpenChange={setOpen}>
      <AdaptiveDialogTrigger asChild>
        <button
          aria-label={t("help")}
          className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors p-1 rounded-full hover:bg-muted cursor-pointer"
        >
          <HelpCircle className={iconClass} />
        </button>
      </AdaptiveDialogTrigger>
      <AdaptiveDialogContent desktopClassName="max-w-lg">
        <AdaptiveDialogHeader>
          <AdaptiveDialogTitle>{title ?? slug}</AdaptiveDialogTitle>
        </AdaptiveDialogHeader>
        <div
          className="prose dark:prose-invert max-w-none prose-sm"
          data-testid={`help-${slug}`}
        >
          {loading ? (
            <div className="text-muted-foreground">{t("loadingEllipsis")}</div>
          ) : null}
          {error ? <div className="text-destructive">{error}</div> : null}
          {!loading && !error ? (
            <div dangerouslySetInnerHTML={{ __html: html }} />
          ) : null}
        </div>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
};

export default InfoHelp;
