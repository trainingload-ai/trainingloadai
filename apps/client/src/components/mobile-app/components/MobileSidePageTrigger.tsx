"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { MOBILE_SIDE_PAGE_EVENT } from "./MobilePushSidePage";
import { MobileTopBarAction } from "./MobileTopBar";

export function MobileSidePageTrigger({
  onToggle,
  openLabel,
  children,
  badge,
}: {
  onToggle: () => void;
  openLabel: string;
  children: ReactNode;
  badge?: ReactNode;
}) {
  const t = useTranslations("SharedUI");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handle = (event: Event) => {
      setOpen(Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open));
    };
    window.addEventListener(MOBILE_SIDE_PAGE_EVENT, handle);
    return () => window.removeEventListener(MOBILE_SIDE_PAGE_EVENT, handle);
  }, []);

  return (
    <MobileTopBarAction
      onClick={onToggle}
      aria-label={open ? t("close") : openLabel}
      aria-expanded={open}
      edge="leading"
      className={cn(open && "opacity-0")}
    >
      {children}
      {open ? null : badge}
    </MobileTopBarAction>
  );
}
