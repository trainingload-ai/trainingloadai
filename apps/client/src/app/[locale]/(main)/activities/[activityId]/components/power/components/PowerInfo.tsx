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

export function PowerInfo() {
  const t = useTranslations("ActivityPowerPage.powerInfo");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(e) => e.stopPropagation()}
          className="ml-1 text-muted-foreground transition-colors hover:text-foreground"
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
          {/* 描述 */}
          <div className="space-y-3">
            <p className="leading-relaxed">{t("description")}</p>
            <div className="leading-relaxed">
              {t.rich("details", {
                br: () => <br />,
                b: (chunks) => (
                  <span className="font-bold text-foreground">{chunks}</span>
                ),
              })}
            </div>
          </div>

          <Separator />

          {/* 商标声明 */}
          <div className="text-mobile-caption pc:text-xs text-muted-foreground italic">
            {t("trademark")}
          </div>

          {/* 参考来源 */}
          <div className="bg-neutral-100 dark:bg-muted/45 p-3 rounded-md border border-border/40 flex items-start gap-3">
            <div className="bg-background p-1.5 rounded-md border border-border/50 shrink-0">
              <ExternalLink className="h-4 w-4 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-mobile-caption pc:text-xs font-medium text-foreground">
                {t("source")}
              </p>
              <a
                href="https://trainingpeaks.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-mobile-caption pc:text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
              >
                {t("sourceLink")}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
