"use client";

import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MobilePushSidePage } from "./MobilePushSidePage";
import { MobileTopBar } from "./MobileTopBar";

export function MobileSidePage({
  open,
  onOpenChange,
  title,
  description,
  children,
  trailing,
  contentClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  contentClassName?: string;
}) {
  const t = useTranslations("SharedUI");
  const titleId = useId();
  const descriptionId = useId();

  return (
    <MobilePushSidePage
      open={open}
      onOpenChange={onOpenChange}
      className="flex flex-col overflow-hidden p-0"
      role="dialog"
      ariaLabelledBy={titleId}
      ariaDescribedBy={descriptionId}
    >
      <button
        type="button"
        className="sr-only"
        onClick={() => onOpenChange(false)}
      >
        {t("close")}
      </button>
      <MobileTopBar
        placement="inline"
        titleAs="h2"
        title={title}
        subtitle={description}
        titleId={titleId}
        descriptionId={descriptionId}
        trailing={trailing}
      />
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-muted/25 px-safe-or-3 py-4",
          contentClassName,
        )}
      >
        {children}
      </div>
    </MobilePushSidePage>
  );
}
