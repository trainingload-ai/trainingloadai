import React from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { HelpCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function TrimpInfo() {
  const t = useTranslations("HeartRatePage.trimpInfo");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="sr-only">{t("title")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90dvh] max-w-md flex-col gap-0 overflow-hidden pc:max-h-[min(85dvh,720px)]">
        <DialogHeader className="shrink-0 pr-12">
          <DialogTitle className="flex items-center gap-2 text-lg">
            {t("title")}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-6 min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain pr-2 text-sm text-muted-foreground [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]">
          {/* 核心定义 */}
          <div className="space-y-3">
            <p className="leading-relaxed">
              {t.rich("description", {
                highlight: (chunks) => (
                  <span className="text-foreground font-medium mx-1">
                    {chunks}
                  </span>
                ),
              })}
            </p>
            <p className="leading-relaxed">
              {t.rich("details", {
                highlight: (chunks) => (
                  <span className="text-foreground">{chunks}</span>
                ),
              })}
            </p>
          </div>

          {/* 参考来源卡片 */}
          <div className="bg-neutral-100 dark:bg-muted/45 p-3 rounded-md border border-border/40 flex items-start gap-3">
            <div className="bg-background p-1.5 rounded-md border border-border/50 shrink-0">
              <ExternalLink className="h-4 w-4 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-mobile-caption pc:text-xs font-medium text-foreground">
                {t("source")}
              </p>
              <a
                href="https://fellrnr.com/wiki/TRIMP#TRIMPexp_Exponential_Heart_Rate_Scaling"
                target="_blank"
                rel="noopener noreferrer"
                className="text-mobile-caption pc:text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
              >
                {t("sourceLink")}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
          </div>

          <Separator />

          {/* 参考范围 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-foreground text-sm">
                {t("rangeTitle")}
              </h4>
              <a
                href="https://www.firstbeat.com/en/blog/what-is-trimp/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-mobile-unit pc:text-[10px] text-muted-foreground hover:text-primary hover:underline transition-colors flex items-center gap-1"
              >
                {t("rangeSource")}
                <ExternalLink className="h-2 w-2" />
              </a>
            </div>
            <div className="grid grid-cols-3 gap-3 text-mobile-caption pc:text-xs">
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-md space-y-1">
                <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {"< 70"}
                </div>
                <div className="text-muted-foreground">{t("ranges.easy")}</div>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 p-2.5 rounded-md space-y-1">
                <div className="font-semibold text-blue-600 dark:text-blue-400">
                  70 - 140
                </div>
                <div className="text-muted-foreground">
                  {t("ranges.moderate")}
                </div>
              </div>
              <div className="bg-orange-500/10 border border-orange-500/20 p-2.5 rounded-md space-y-1">
                <div className="font-semibold text-orange-600 dark:text-orange-400">
                  {"> 140"}
                </div>
                <div className="text-muted-foreground">{t("ranges.hard")}</div>
              </div>
            </div>
          </div>

          {/* 底部注解 */}
          <div className="bg-yellow-500/5 text-yellow-600/90 dark:text-yellow-500/90 text-mobile-caption pc:text-xs p-3 ">
            {t("note")}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
