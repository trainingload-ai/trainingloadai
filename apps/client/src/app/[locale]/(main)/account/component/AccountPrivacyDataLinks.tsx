"use client";

import {
  Archive,
  BrainCircuit,
  ChevronRight,
  Database,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { useAiDataConsent } from "@/api/ai-data-consent";
import { fetchAthleteMemoryPreference } from "@/api/athlete-memory";
import { useSelfHostAiAccess } from "@/hooks/useSelfHostAiAccess";
import { Link } from "@/i18n/navigation";
import { useQuery } from "@tanstack/react-query";

type SettingsLinkProps = {
  description: string;
  href:
    | "/account/privacy-ai"
    | "/account/athlete-memory"
    | "/account/data-export";
  icon: LucideIcon;
  title: string;
  value?: string;
};

function SettingsLink({
  description,
  href,
  icon: Icon,
  title,
  value,
}: SettingsLinkProps) {
  return (
    <Link
      href={href}
      className="group flex min-h-16 items-center gap-3 px-3 py-3 outline-none transition-colors hover:bg-black/[0.035] focus-visible:bg-black/[0.035] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:hover:bg-white/[0.045] dark:focus-visible:bg-white/[0.045]"
    >
      <Icon
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{title}</span>
          {value ? (
            <span className="text-mobile-caption text-muted-foreground pc:text-xs">
              {value}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-mobile-caption leading-relaxed text-muted-foreground pc:text-xs">
          {description}
        </span>
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none"
        aria-hidden="true"
      />
    </Link>
  );
}

export function AccountPrivacyDataLinks() {
  const t = useTranslations("AccountPage.privacyData");
  const tSelfHostAi = useTranslations("SelfHostAiSettings");
  const selfHostAi = useSelfHostAiAccess();
  const showSelfHostAi = selfHostAi.isOwner;
  const consent = useAiDataConsent({ enabled: !showSelfHostAi });
  const memoryPreference = useQuery({
    queryKey: ["athlete-memory", "preference"],
    queryFn: fetchAthleteMemoryPreference,
  });
  const consentEnabled = consent.data?.granted === true;
  const selfHostProvider = selfHostAi.configuration.data?.provider;
  const selfHostProviderLabel =
    selfHostAi.isEnabled && selfHostProvider && selfHostProvider !== "none"
      ? tSelfHostAi(`providers.${selfHostProvider}`)
      : tSelfHostAi("statusDisabled");

  return (
    <section id="privacy-data" className="scroll-mt-16">
      <div className="mb-2 px-1">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="mt-1 text-mobile-caption leading-relaxed text-muted-foreground pc:text-xs">
          {t("description")}
        </p>
      </div>
      <nav
        className="divide-y divide-border/70 overflow-hidden rounded-surface bg-neutral-100 dark:bg-muted/45"
        aria-label={t("title")}
      >
        <SettingsLink
          href="/account/privacy-ai"
          icon={BrainCircuit}
          title={showSelfHostAi ? tSelfHostAi("title") : t("ai.title")}
          description={
            showSelfHostAi
              ? tSelfHostAi("privacySummaryDescription")
              : t("ai.description")
          }
          value={
            selfHostAi.isResolving ||
            (showSelfHostAi && selfHostAi.configuration.isLoading) ||
            (!showSelfHostAi && consent.isLoading)
              ? t("status.loading")
              : showSelfHostAi
                ? selfHostProviderLabel
                : consentEnabled
                  ? t("status.enabled")
                  : t("status.disabled")
          }
        />
        <SettingsLink
          href="/account/athlete-memory"
          icon={Database}
          title={t("memory.title")}
          description={t("memory.description")}
          value={
            memoryPreference.isLoading
              ? t("status.loading")
              : memoryPreference.data?.enabled
                ? t("memory.statusEnabled")
                : t("memory.statusDisabled")
          }
        />
        <SettingsLink
          href="/account/data-export"
          icon={Archive}
          title={t("export.title")}
          description={t("export.description")}
        />
      </nav>
    </section>
  );
}
