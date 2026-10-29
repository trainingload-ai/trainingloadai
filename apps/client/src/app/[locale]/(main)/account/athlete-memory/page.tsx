import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { MainScrollPageShell } from "@/components/layout/MainScrollPageShell";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { AccountPageTitle } from "../AccountPageTitle";
import { AthleteMemorySettings } from "./AthleteMemorySettings";

export default async function AthleteMemoryPage() {
  const t = await getTranslations("AthleteMemory");
  return (
    <MainScrollPageShell maxWidthClass="max-w-3xl">
      <AccountPageTitle title={t("title")} />
      <header className="mb-4 flex items-start gap-2">
        <Button asChild variant="ghost" size="icon-sm">
          <Link href="/account" aria-label={t("back")}>
            <ArrowLeft aria-hidden="true" />
          </Link>
        </Button>
        <div className="min-w-0 pt-0.5">
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 max-w-2xl text-mobile-caption leading-relaxed text-muted-foreground pc:text-xs">
            {t("description")}
          </p>
        </div>
      </header>
      <AthleteMemorySettings />
    </MainScrollPageShell>
  );
}
