"use client";

import React, { useId } from "react";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
} from "@/components/ui/adaptive-dialog";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CalendarClock,
  Check,
  Library,
  MessageSquareText,
  Pencil,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type CreatePlanMode = "template" | "ai" | "manual" | "rolling";

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
  eyebrow,
  features,
  action,
  onClick,
  disabled,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  eyebrow: string;
  features: readonly [string, string];
  action: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) => {
  const id = useId();

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description ${id}-features`}
      className={cn(
        "group grid min-w-0 w-full grid-cols-[auto_minmax(0,1fr)] items-stretch gap-x-3 rounded-md bg-muted/55 p-4 text-left text-foreground transition-colors sm:row-span-5 sm:grid-cols-1 sm:grid-rows-[auto_auto_auto_1fr_auto] sm:gap-y-4 sm:p-6 sm:supports-[grid-template-rows:subgrid]:grid-rows-subgrid",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        !disabled && "cursor-pointer",
        disabled && "cursor-not-allowed opacity-50 hover:bg-muted/55",
        className,
      )}
    >
      <span className="row-span-3 flex min-h-6 items-start gap-2.5 text-muted-foreground sm:row-span-1 sm:items-center">
        <span aria-hidden="true" className="shrink-0 [&_svg]:size-5">
          {icon}
        </span>
        <span className="hidden text-xs leading-5 sm:inline">{eyebrow}</span>
      </span>
      <span
        id={`${id}-title`}
        className="col-start-2 text-base font-semibold leading-6 text-foreground sm:col-auto"
      >
        {title}
      </span>
      <span
        id={`${id}-description`}
        className="col-start-2 mt-1.5 text-sm leading-6 text-muted-foreground sm:col-auto sm:mt-0"
      >
        {desc}
      </span>
      <span
        id={`${id}-features`}
        className="hidden flex-col gap-2.5 text-xs leading-5 text-muted-foreground sm:flex"
      >
        {features.map((feature) => (
          <span key={feature} className="flex items-start gap-2">
            <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            <span>{feature}</span>
          </span>
        ))}
      </span>
      <span className="col-start-2 mt-3 flex items-end justify-between gap-3 text-sm font-medium leading-5 text-foreground sm:col-auto sm:mt-auto">
        <span>{action}</span>
        <ArrowRight
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 transition-transform motion-reduce:transform-none",
            !disabled && "group-hover:translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
};

export function CreatePlanModeDialog(props: CreatePlanModeDialogProps) {
  const { open, onOpenChange, onSelect, aiDisabled, className } = props;
  const t = useTranslations("CreatePlanDialog");
  const rollingT = useTranslations("RollingPlan");

  return (
    <AdaptiveDialog
      open={open}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
    >
      <AdaptiveDialogContent
        className={cn("flex flex-col gap-0 overflow-hidden p-0", className)}
        desktopClassName="max-h-[90dvh] w-full max-w-none pc:max-h-[90dvh] pc:w-[calc(100%-3rem)] pc:max-w-[1100px] pc:p-0"
        mobileClassName="max-h-[92dvh] bg-background"
        desktopProps={{ onInteractOutside: (event) => event.preventDefault() }}
      >
        <AdaptiveDialogHeader className="shrink-0 gap-2 px-5 pb-5 pt-6 text-left pc:px-6">
          <AdaptiveDialogTitle className="pr-8 text-lg font-semibold tracking-normal text-foreground">
            {t("title")}
          </AdaptiveDialogTitle>
          <AdaptiveDialogDescription className="text-left text-sm leading-6 text-muted-foreground">
            {t("description")}
          </AdaptiveDialogDescription>
        </AdaptiveDialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-1 pc:px-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-y-4 lg:grid-cols-4">
            <OptionCard
              icon={<CalendarClock />}
              title={rollingT("title")}
              desc={rollingT("description")}
              eyebrow={t("options.rolling.eyebrow")}
              features={[
                t("options.rolling.feature1"),
                t("options.rolling.feature2"),
              ]}
              action={t("options.rolling.action")}
              onClick={() => onSelect("rolling")}
              disabled={aiDisabled}
            />
            <OptionCard
              icon={<Library />}
              title={t("options.template.title")}
              desc={t("options.template.desc")}
              eyebrow={t("options.template.badge")}
              features={[
                t("options.template.feature1"),
                t("options.template.feature2"),
              ]}
              action={t("options.template.action")}
              onClick={() => onSelect("template")}
            />
            <OptionCard
              icon={<MessageSquareText />}
              title={t("options.ai.title")}
              desc={t("options.ai.desc")}
              eyebrow={t("options.ai.eyebrow")}
              features={[t("options.ai.feature1"), t("options.ai.feature2")]}
              action={t("options.ai.action")}
              onClick={() => onSelect("ai")}
              disabled={aiDisabled}
            />
            <OptionCard
              icon={<Pencil />}
              title={t("options.manual.title")}
              desc={t("options.manual.desc")}
              eyebrow={t("options.manual.eyebrow")}
              features={[
                t("options.manual.feature1"),
                t("options.manual.feature2"),
              ]}
              action={t("options.manual.action")}
              onClick={() => onSelect("manual")}
            />
          </div>
        </div>
        <div className="shrink-0 px-5 pb-4 md:hidden">
          <Button
            variant="outline"
            size="xl"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            {t("buttons.cancel")}
          </Button>
        </div>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}

export default CreatePlanModeDialog;
