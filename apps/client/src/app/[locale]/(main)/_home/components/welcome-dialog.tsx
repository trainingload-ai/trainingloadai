"use client";

import React, { useEffect, useState } from "react";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  adaptiveDialogFooterActionButtonClassName,
  adaptiveDialogFooterActionsClassName,
} from "@/components/ui/adaptive-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CircleCheck, Sparkles, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsNewUser } from "@/api/use-user";
import { useTranslations } from "next-intl";

type WelcomeDialogProps = {
  open?: boolean;
  className?: string;
  onClosed?: () => void;
};

const SectionItem = ({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) => (
  <div className="flex items-start gap-3 p-3 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-800/40">
    <div className="mt-0.5 text-primary">{icon}</div>
    <div className="flex-1">
      <div className="text-sm font-semibold mb-1">{title}</div>
      <div className="text-mobile-caption pc:text-xs text-muted-foreground leading-relaxed">
        {desc}
      </div>
    </div>
  </div>
);

export default function WelcomeDialog(props: WelcomeDialogProps) {
  const { open: openProp, className, onClosed } = props;
  const { data: isNewUser } = useIsNewUser();
  const t = useTranslations("WelcomeDialog");

  const [open, setOpen] = useState<boolean>(Boolean(openProp ?? isNewUser));
  useEffect(() => {
    setOpen(Boolean(openProp ?? isNewUser));
  }, [openProp, isNewUser]);

  const handleClose = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      // 关闭时标记不再提示，并在 use-user hooks 中自动刷新 isNewUser
      //   markNotNew();
      // 通知外部欢迎弹窗已关闭（用于联动打开新手引导）
      onClosed?.();
    }
  };

  return (
    <AdaptiveDialog open={open} onOpenChange={handleClose}>
      <AdaptiveDialogContent
        desktopClassName={cn(
          "sm:max-w-lg md:max-w-xl lg:max-w-2xl p-0 overflow-hidden flex flex-col gap-0 max-h-[calc(100vh-2rem)]",
          "rounded-2xl border border-neutral-200 dark:border-neutral-700",
          "bg-background",
          className,
        )}
        mobileClassName={cn(
          "overflow-hidden flex flex-col gap-0",
          "rounded-t-compact border border-neutral-200 dark:border-neutral-700",
          "bg-background",
          className,
        )}
        desktopProps={{
          onInteractOutside: (e) => e.preventDefault(),
        }}
      >
        <div className="shrink-0 p-4 sm:p-2 border-b border-neutral-200 dark:border-neutral-700">
          <AdaptiveDialogHeader className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="text-mobile-caption pc:text-xs px-2 py-0.5"
                >
                  {t("badge.beta")}
                </Badge>
                <AdaptiveDialogTitle className="text-lg">
                  {t("title")}
                </AdaptiveDialogTitle>
              </div>
            </div>
            <AdaptiveDialogDescription>
              {t("description")}
            </AdaptiveDialogDescription>
          </AdaptiveDialogHeader>
        </div>

        {/* 内容区块 */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 p-4 sm:p-6">
          <SectionItem
            icon={<ShieldAlert className="w-4 h-4" />}
            title={t("sections.testVersion.title")}
            desc={t("sections.testVersion.desc")}
          />
          <SectionItem
            icon={<CircleCheck className="w-4 h-4" />}
            title={t("sections.free.title")}
            desc={t("sections.free.desc")}
          />
          <SectionItem
            icon={<Sparkles className="w-4 h-4" />}
            title={t("sections.feedback.title")}
            desc={t("sections.feedback.desc")}
          />
        </div>

        {/* 操作区 */}
        <div
          className={cn(
            "shrink-0 p-4 pt-0 sm:px-6 sm:pb-6",
            adaptiveDialogFooterActionsClassName,
          )}
        >
          <Button
            type="button"
            variant="default"
            size="dialog-action"
            className={cn(
              adaptiveDialogFooterActionButtonClassName,
              "w-full flex-none sm:w-full",
            )}
            onClick={() => handleClose(false)}
          >
            {t("buttons.start")}
          </Button>
        </div>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
