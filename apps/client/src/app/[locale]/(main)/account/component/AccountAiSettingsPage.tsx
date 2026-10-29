"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { MainScrollPageShell } from "@/components/layout/MainScrollPageShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSelfHostAiAccess } from "@/hooks/useSelfHostAiAccess";
import { Link } from "@/i18n/navigation";
import { SelfHostAiSettings } from "../../settings/component/SelfHostAiSettings";
import { AccountPageTitle } from "../AccountPageTitle";
import { PrivacyAiSettings } from "./PrivacyAiSettings";

export function AccountAiSettingsPage() {
  const tConsent = useTranslations("AiDataConsent");
  const tSelfHostAi = useTranslations("SelfHostAiSettings");
  const selfHostAi = useSelfHostAiAccess();
  const showSelfHostAi = selfHostAi.isOwner;
  const title = showSelfHostAi
    ? tSelfHostAi("title")
    : tConsent("settingsTitle");
  const description = showSelfHostAi
    ? tSelfHostAi("description")
    : tConsent("settingsHint");

  return (
    <MainScrollPageShell maxWidthClass="max-w-3xl">
      <AccountPageTitle title={title} />
      <header className="mb-4 flex items-start gap-2">
        <Button asChild variant="ghost" size="icon-sm">
          <Link href="/account" aria-label={title}>
            <ArrowLeft aria-hidden="true" />
          </Link>
        </Button>
        <div className="min-w-0 pt-0.5">
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="mt-1 max-w-2xl text-mobile-caption leading-relaxed text-muted-foreground pc:text-xs">
            {description}
          </p>
        </div>
      </header>

      {selfHostAi.isResolving ? (
        <div className="space-y-3 rounded-md border border-border bg-muted/20 px-3 py-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="ml-auto h-8 w-32" />
        </div>
      ) : showSelfHostAi ? (
        <SelfHostAiSettings surface="account" />
      ) : (
        <PrivacyAiSettings />
      )}
    </MainScrollPageShell>
  );
}
