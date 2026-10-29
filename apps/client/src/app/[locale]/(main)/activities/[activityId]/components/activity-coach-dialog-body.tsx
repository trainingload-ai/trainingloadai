"use client";

import dynamic from "next/dynamic";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";

function ActivityCoachDialogLoading() {
  const t = useTranslations("AiCoachPage");
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      <LoaderCircle className="h-8 w-8 animate-spin" />
      <span>{t("loadingThread")}</span>
    </div>
  );
}

export const ActivityCoachDialogBody = dynamic(
  () =>
    import("./activity-coach-conversation").then(
      (module) => module.ActivityCoachConversation,
    ),
  {
    ssr: false,
    loading: ActivityCoachDialogLoading,
  },
);

export function preloadActivityCoachConversation() {
  void import("./activity-coach-conversation");
}
