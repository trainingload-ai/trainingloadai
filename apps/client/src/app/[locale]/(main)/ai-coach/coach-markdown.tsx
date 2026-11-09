"use client";

import { Streamdown } from "streamdown";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useRuntimeEnvironment } from "@/hooks/use-runtime-environment";
import { COACH_ASSISTANT_PROSE_CLASS } from "./coach-assistant-prose";
import { DesktopExternalLinkDialog } from "./desktop-external-link-dialog";

type CoachMarkdownProps = {
  children: string;
  className?: string;
  streaming?: boolean;
};

export function CoachMarkdown({
  children,
  className,
  streaming = false,
}: CoachMarkdownProps) {
  const t = useTranslations("AiCoachPage.externalLink");
  const sharedT = useTranslations("SharedUI");
  const { isDesktopSelfHost, desktop } = useRuntimeEnvironment();
  return (
    <Streamdown
      className={cn(COACH_ASSISTANT_PROSE_CLASS, className)}
      controls={false}
      mode={streaming ? "streaming" : "static"}
      parseIncompleteMarkdown={streaming}
      translations={{
        openExternalLink: t("title"),
        externalLinkWarning: t("webDescription"),
        copyLink: t("copy"),
        copied: t("copied"),
        openLink: t("open"),
        close: sharedT("close"),
      }}
      linkSafety={{
        enabled: true,
        renderModal: isDesktopSelfHost
          ? (props) => (
              <DesktopExternalLinkDialog
                {...props}
                openExternalLink={desktop?.openExternalLink}
              />
            )
          : undefined,
      }}
    >
      {children}
    </Streamdown>
  );
}
