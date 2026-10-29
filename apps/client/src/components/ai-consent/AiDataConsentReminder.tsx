"use client";

import { ChevronRight, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { useAiDataConsent } from "@/api/ai-data-consent";
import { track } from "@/lib/analytics";
import { usePublicDemo } from "@/public-demo/public-demo-provider";

import { AiDataConsentDialog } from "./AiDataConsentDialog";

export function AiDataConsentReminder() {
  const t = useTranslations("AiDataConsent");
  const publicDemo = usePublicDemo();
  const consent = useAiDataConsent({ enabled: !publicDemo.active });
  const [dialogOpen, setDialogOpen] = useState(false);
  const viewedStateRef = useRef<string | null>(null);
  const state = consent.data?.state;
  const visible =
    !publicDemo.active &&
    (state === "UNDECIDED" ||
      state === "DECLINED" ||
      state === "RECONSENT_REQUIRED");

  useEffect(() => {
    if (!visible || !state || viewedStateRef.current === state) return;
    viewedStateRef.current = state;
    track("ai_consent_reminder_viewed", { state });
  }, [state, visible]);

  // Demo 数据由发布流程统一管理，访客既不拥有数据账号，也不能替它
  // 作出隐私授权决定。即使数据集审计暂时漏掉同意记录，也不能展示
  // 一个必然会被只读 Guard 拒绝的操作入口。
  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        className="flex min-h-9 w-full items-center gap-2 rounded-xl bg-[rgba(0,150,137,0.1)] px-3 py-2 text-left transition-colors hover:bg-[rgba(0,150,137,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 dark:bg-[rgba(0,188,125,0.12)] dark:hover:bg-[rgba(0,188,125,0.18)]"
        onClick={() => {
          track("ai_consent_reminder_opened", { state });
          setDialogOpen(true);
        }}
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[rgba(0,150,137,0.12)] text-teal-700 dark:bg-[rgba(0,188,125,0.14)] dark:text-teal-300">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-[18px] text-foreground">
          {t("title")}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-teal-800 dark:text-teal-300">
          <span className="hidden sm:inline">{t("reviewAction")}</span>
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </span>
      </button>

      <AiDataConsentDialog
        open={dialogOpen}
        source="HOME_REMINDER"
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
