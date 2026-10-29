"use client";

import { useTranslations } from "next-intl";
import { MainScrollPageShell } from "@/components/layout/MainScrollPageShell";
import { useSetPageTitle } from "../../../../hooks/useSetPageTitle";
import { SettingsInner } from "./component/SettingsInner";

export default function SettingsPage() {
  const t = useTranslations("SettingsPage");
  useSetPageTitle(t("title"));

  return (
    <MainScrollPageShell className="flex flex-col gap-3 pb-3 md:gap-4">
      <header className="px-1 py-1">
        <h1 className="text-xl font-semibold text-foreground md:text-2xl">
          {t("settings")}
        </h1>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          {t("description")}
        </p>
      </header>
      <SettingsInner />
    </MainScrollPageShell>
  );
}
