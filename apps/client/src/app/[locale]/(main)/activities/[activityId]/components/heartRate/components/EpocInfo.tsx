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

export function EpocInfo() {
  const t = useTranslations("HeartRatePage.epocInfo");

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
              <div className="flex flex-col gap-1">
                <a
                  href="https://assets.firstbeat.com/firstbeat/uploads/2015/10/rusko_et_al_acsm_2003_congress-1.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-mobile-caption pc:text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 w-fit"
                >
                  {t("firstbeatSource")}
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
