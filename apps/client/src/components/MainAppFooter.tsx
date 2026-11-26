"use client";

import { useTranslations } from "next-intl";
import { APP_VERSION } from "@/utils/version";
import { useRuntimeEnvironment } from "@/hooks/use-runtime-environment";

const SUPPORT_EMAIL = "support@trainingload.ai";
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=Trainingload.ai%20feedback`;

export function MainAppFooter() {
  const t = useTranslations("SharedUI");
  const desktopT = useTranslations("desktopChrome");
  const { isDesktopSelfHost } = useRuntimeEnvironment();
  return (
    <footer className="hidden w-full shrink-0 flex-wrap items-center justify-center gap-1 border-t border-border/70 bg-background p-2 text-center text-mobile-caption text-muted-foreground pc:flex pc:text-xs">
      <span>
        {isDesktopSelfHost
          ? `${desktopT("appName")} · ${APP_VERSION}`
          : t("platformTitleWithVersion", { version: APP_VERSION })}
      </span>
      <span aria-hidden="true">·</span>
      <span>{t("feedback")}</span>
      <a
        href={SUPPORT_MAILTO}
        className="font-medium text-foreground/75 underline underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {SUPPORT_EMAIL}
      </a>
    </footer>
  );
}
