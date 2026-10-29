"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import {
  BELOW_PC_MEDIA_QUERY,
  MOBILE_MEDIA_QUERY,
  useMobileOnlyOpen,
} from "@/hooks/use-mobile";
import { MobileTopBar, MobileTopBarAction } from "./MobileTopBar";

export function MobileSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  leading,
  trailing,
  fullScreen = false,
  contentClassName,
  backgroundVariant = "default",
  viewportScope = "mobile",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  fullScreen?: boolean;
  contentClassName?: string;
  backgroundVariant?: "default" | "grouped";
  viewportScope?: "mobile" | "below-pc";
}) {
  const t = useTranslations("SharedUI");
  const mobileOpen = useMobileOnlyOpen(
    open,
    onOpenChange,
    viewportScope === "below-pc" ? BELOW_PC_MEDIA_QUERY : MOBILE_MEDIA_QUERY,
  );
  return (
    <Drawer
      open={mobileOpen}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
    >
      <DrawerContent
        className={cn(
          "max-h-[96dvh] rounded-t-2xl",
          fullScreen ? "h-[96dvh]" : "h-[55dvh]",
          backgroundVariant === "grouped" &&
            "bg-neutral-100 dark:bg-[#202221]",
          className,
        )}
      >
        <DrawerHeader className="shrink-0 p-0 text-left">
          <MobileTopBar
            placement="sheet"
            titleAs="div"
            title={<DrawerTitle className="truncate">{title}</DrawerTitle>}
            subtitle={description}
            leading={leading}
            trailing={
              trailing ?? (
                <MobileTopBarAction
                  data-vaul-no-drag
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                  onClick={() => onOpenChange(false)}
                  aria-label={t("close")}
                  className="rounded-full bg-white/70 text-zinc-900 shadow-sm ring-1 ring-black/5 backdrop-blur-xl hover:bg-white/90 active:bg-white/80 dark:bg-white/10 dark:text-zinc-50 dark:ring-white/10 dark:hover:bg-white/15 dark:active:bg-white/15"
                >
                  <X className="size-[18px]" aria-hidden="true" />
                </MobileTopBarAction>
              )
            }
          />
          <DrawerDescription className="sr-only">
            {description ?? title}
          </DrawerDescription>
        </DrawerHeader>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain px-safe-or-3 py-3",
            contentClassName,
          )}
        >
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
