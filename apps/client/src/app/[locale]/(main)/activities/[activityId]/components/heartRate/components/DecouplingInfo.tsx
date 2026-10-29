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

export function DecouplingInfo() {
  const t = useTranslations("HeartRatePage.decouplingInfo");

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
      <DialogContent className="max-w-md gap-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {t("title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 text-sm text-muted-foreground">
          {/* 核心定义 */}
          <div className="space-y-3">
            <p className="leading-relaxed">{t("description")}</p>
            <p className="leading-relaxed">
              {t.rich("details", {
                highlight: (chunks) => (
                  <span className="text-foreground font-medium mx-1">
                    {chunks}
                  </span>
                ),
              })}
            </p>
            <p className="leading-relaxed">
              {t.rich("interpretation", {
                highlight: (chunks) => (
                  <span className="text-foreground font-medium mx-1">
                    {chunks}
                  </span>
                ),
              })}
            </p>
          </div>

          <div className="bg-neutral-100 dark:bg-muted/45 p-3 rounded-md border border-border/40 flex flex-col gap-2">
            <div className="space-y-1">
              <div className="text-mobile-caption pc:text-xs font-medium text-foreground">
                {t("pwHr")}
              </div>
              <div className="text-mobile-caption pc:text-[11px] font-mono text-muted-foreground">
                {t("pwHrFormula")}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-mobile-caption pc:text-xs font-medium text-foreground">
                {t("paHr")}
              </div>
              <div className="text-mobile-caption pc:text-[11px] font-mono text-muted-foreground">
                {t("paHrFormula")}
              </div>
            </div>
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
                href="https://tailwind-coaching.com/2017/03/30/what-is-aerobic-decoupling/"
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

          <div className="text-mobile-caption pc:text-xs text-muted-foreground bg-yellow-500/10 ">
            {t("note")}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
