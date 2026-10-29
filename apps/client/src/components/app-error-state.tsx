"use client";

import {
  ArrowLeft,
  Home,
  RefreshCw,
  RouteOff,
  ShieldAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";

type AppErrorKind = "not-found" | "server-error";

type AppErrorStateProps = {
  kind: AppErrorKind;
  digest?: string;
  onRetry?: () => void;
};

const primaryButtonClass = "font-medium hover:bg-primary/90";

const outlineButtonClass =
  "border-input bg-background font-medium hover:bg-neutral-200 hover:text-foreground dark:border-border dark:bg-muted/60 dark:text-foreground dark:hover:bg-muted";

export function AppErrorState({ kind, digest, onRetry }: AppErrorStateProps) {
  const t = useTranslations("AppError");
  const router = useRouter();
  const isNotFound = kind === "not-found";
  const copyKey = isNotFound ? "notFound" : "serverError";
  const EyebrowIcon = isNotFound ? RouteOff : ShieldAlert;

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-7xl items-center px-4 py-8 sm:px-6 lg:px-8">
      <section className="max-w-3xl py-6">
        <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-mobile-caption pc:text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-200">
          <EyebrowIcon className="h-4 w-4" />
          {t(`${copyKey}.eyebrow`)}
        </div>
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
          {t(`${copyKey}.title`)}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
          {t(`${copyKey}.description`)}
        </p>

        <div className="mt-7 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          {isNotFound ? (
            <>
              <Link href="/" className="inline-flex sm:w-auto">
                <Button size="sm" className={primaryButtonClass}>
                  <Home className="h-4 w-4" />
                  {t("notFound.primary")}
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                className={outlineButtonClass}
                onClick={() => router.back()}
              >
                <ArrowLeft className="h-4 w-4" />
                {t("notFound.secondary")}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                className={primaryButtonClass}
                onClick={onRetry}
              >
                <RefreshCw className="h-4 w-4" />
                {t("serverError.primary")}
              </Button>
              <Link href="/" className="inline-flex sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className={outlineButtonClass}
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t("serverError.secondary")}
                </Button>
              </Link>
            </>
          )}
        </div>

        {!isNotFound && digest ? (
          <div className="mt-6 max-w-xl rounded-md border border-border bg-muted/30 p-3">
            <div className="text-mobile-caption pc:text-xs font-medium text-muted-foreground">
              {t("serverError.reference")}
            </div>
            <div className="mt-1 break-all font-mono text-mobile-caption pc:text-xs text-foreground">
              {digest}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
