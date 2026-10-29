"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Home,
  RefreshCw,
  RouteOff,
  ShieldAlert,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { localePrefix } from "@/lib/locale-url";

type SiteErrorKind = "not-found" | "server-error";

type SiteErrorStateProps = {
  kind: SiteErrorKind;
  digest?: string;
  onRetry?: () => void;
};

const primaryButtonClass =
  "h-11 rounded-compact border-0 px-5 text-sm font-medium shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:bg-primary/90 dark:shadow-none";

const outlineButtonClass =
  "h-11 rounded-compact border-input bg-background px-5 text-sm font-medium shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-neutral-200 hover:text-foreground dark:border-border dark:bg-muted/60 dark:text-foreground dark:shadow-none dark:hover:bg-muted";

export function SiteErrorState({ kind, digest, onRetry }: SiteErrorStateProps) {
  const t = useTranslations("SiteError");
  const params = useParams();
  const langParam = params?.lang;
  const lang =
    typeof langParam === "string"
      ? langParam
      : Array.isArray(langParam)
        ? langParam[0]
        : "en";
  const prefix = localePrefix(lang);
  const isNotFound = kind === "not-found";
  const copyKey = isNotFound ? "notFound" : "serverError";
  const EyebrowIcon = isNotFound ? RouteOff : ShieldAlert;

  return (
    <div className="client-demo-radius mx-auto flex min-h-[60vh] w-full max-w-7xl items-center px-4 py-8 text-neutral-950 dark:text-white sm:px-6 lg:px-8">
      <section className="max-w-3xl py-6">
        <div className="mb-5 inline-flex items-center gap-2 rounded-compact border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-200">
          <EyebrowIcon className="h-4 w-4" />
          {t(`${copyKey}.eyebrow`)}
        </div>
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
          {t(`${copyKey}.title`)}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
          {t(`${copyKey}.description`)}
        </p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          {isNotFound ? (
            <>
              <Link href={`${prefix}/`} className="inline-flex sm:w-auto">
                <Button className={primaryButtonClass}>
                  <Home className="size-4" />
                  {t("notFound.primary")}
                </Button>
              </Link>
              <Link href={`${prefix}/docs`} className="inline-flex sm:w-auto">
                <Button variant="outline" className={outlineButtonClass}>
                  <BookOpen className="size-4" />
                  {t("notFound.secondary")}
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Button className={primaryButtonClass} onClick={onRetry}>
                <RefreshCw className="size-4" />
                {t("serverError.primary")}
              </Button>
              <Link href={`${prefix}/`} className="inline-flex sm:w-auto">
                <Button variant="outline" className={outlineButtonClass}>
                  <ArrowLeft className="size-4" />
                  {t("serverError.secondary")}
                </Button>
              </Link>
            </>
          )}
        </div>

        {!isNotFound && digest ? (
          <div className="mt-6 max-w-xl rounded-compact border border-neutral-200 bg-neutral-50/90 p-3 dark:border-white/10 dark:bg-white/4">
            <div className="text-xs font-medium text-muted-foreground">
              {t("serverError.reference")}
            </div>
            <div className="mt-1 break-all font-mono text-xs text-foreground">
              {digest}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
