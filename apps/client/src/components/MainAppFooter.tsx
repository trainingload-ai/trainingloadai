"use client";

import { usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { APP_VERSION } from "@/utils/version";

const SUPPORT_EMAIL = "support@trainingload.ai";
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=Trainingload.ai%20feedback`;

/**
 * 主应用页脚（版本信息）
 * - AI 教练全屏对话路由不展示，避免干扰沉浸布局
 */
export function MainAppFooter() {
  const t = useTranslations("SharedUI");
  const pathname = usePathname();
  if (pathname === "/ai-coach" || pathname?.startsWith("/ai-coach/")) {
    return null;
  }

  return (
    <div className="hidden w-full shrink-0 flex-wrap items-center justify-center gap-1 border-t border-border/70 bg-background p-2 text-center text-mobile-caption text-muted-foreground pc:flex pc:text-xs">
      <span>{t("platformTitleWithVersion", { version: APP_VERSION })}</span>
      <span aria-hidden="true">·</span>
      <span>{t("feedback")}</span>
      <a
        href={SUPPORT_MAILTO}
        className="font-medium text-foreground/75 underline underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {SUPPORT_EMAIL}
      </a>
    </div>
  );
}
