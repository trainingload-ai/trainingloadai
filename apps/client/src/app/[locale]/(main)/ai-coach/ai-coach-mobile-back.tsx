"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

/**
 * 移动端 AI 教练页左上角返回（大屏由侧栏导航，不显示）
 */
export function AiCoachMobileBack() {
  const router = useRouter();
  const t = useTranslations("AiCoachPage.mobile");

  return (
    <div className="fixed left-safe-or-2 top-safe-offset-14 z-50 pc:hidden">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="rounded-full border-border shadow-sm backdrop-blur-sm"
        aria-label={t("back")}
        onClick={() => router.back()}
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
    </div>
  );
}
