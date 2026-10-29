"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { CoachCard } from "./cards/CoachCard";

export function CoachInvalidStructuredCard() {
  const t = useTranslations("AiCoachPage.transcript");
  return (
    <CoachCard
      tone="warning"
      icon={<AlertTriangle className="h-4 w-4" />}
      title={t("titleSystem")}
      subtitle={t("reasonInternal")}
      dense
    />
  );
}
