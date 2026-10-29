"use client";

import React from "react";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
} from "@/components/ui/adaptive-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Sparkles, Pencil, Library } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type CreatePlanMode = "template" | "ai" | "manual";

export type CreatePlanModeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (mode: CreatePlanMode) => void;
  aiDisabled?: boolean;
  className?: string;
};

const OptionCard = ({
  icon,
  title,
  desc,
  onClick,
  badge,
  disabled,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
  badge?: string;
  disabled?: boolean;
  className?: string;
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex min-h-20 w-full items-center gap-3 rounded-md bg-muted/55 p-3 text-left text-foreground transition-colors",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        !disabled && "cursor-pointer",
        disabled && "cursor-not-allowed opacity-50 hover:bg-muted/55",
        className,
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-background/75 text-muted-foreground transition-colors group-hover:text-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold text-foreground">{title}</div>
          {badge ? <Badge variant="secondary">{badge}</Badge> : null}
        </div>
        <p className="mt-1 text-mobile-caption leading-5 text-muted-foreground pc:text-xs">
          {desc}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
};

export function CreatePlanModeDialog(props: CreatePlanModeDialogProps) {
  const { open, onOpenChange, onSelect, aiDisabled, className } = props;
  const t = useTranslations("CreatePlanDialog");

  return (
    <AdaptiveDialog
      open={open}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
    >
      <AdaptiveDialogContent
        className={cn("flex flex-col gap-0 overflow-hidden p-0", className)}
        desktopClassName="max-h-[min(90dvh,640px)] sm:max-w-md"
        mobileClassName="max-h-[92dvh] bg-background"
        desktopProps={{ onInteractOutside: (event) => event.preventDefault() }}
      >
        <AdaptiveDialogHeader className="shrink-0  text-left ">
          <AdaptiveDialogTitle className="text-base font-semibold tracking-normal text-foreground">
            {t("title")}
          </AdaptiveDialogTitle>
          <AdaptiveDialogDescription className="text-left text-mobile-caption leading-5 text-muted-foreground pc:text-xs">
            {t("description")}
          </AdaptiveDialogDescription>
        </AdaptiveDialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto ">
          <div className="grid grid-cols-1 gap-2.5">
            <OptionCard
              icon={<Library className="h-5 w-5" />}
              title={t("options.template.title")}
              desc={t("options.template.desc")}
              badge={t("options.template.badge")}
              onClick={() => onSelect("template")}
            />
            <OptionCard
              icon={<Sparkles className="h-5 w-5" />}
              title={t("options.ai.title")}
              desc={t("options.ai.desc")}
              onClick={() => onSelect("ai")}
              disabled={aiDisabled}
            />
            <OptionCard
              icon={<Pencil className="h-5 w-5" />}
              title={t("options.manual.title")}
              desc={t("options.manual.desc")}
              onClick={() => onSelect("manual")}
            />
          </div>
          <div className="mt-3 md:hidden">
            <Button
              variant="outline"
              size="xl"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              {t("buttons.cancel")}
            </Button>
          </div>
        </div>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}

export default CreatePlanModeDialog;
