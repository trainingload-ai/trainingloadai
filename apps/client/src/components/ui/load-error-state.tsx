"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import styles from "./load-error-state.module.css";

export function LoadErrorState({ onRetry, retrying = false, compact = false }: {
  onRetry: () => void;
  retrying?: boolean;
  compact?: boolean;
}) {
  const t = useTranslations();
  return (
    <div className={cn(
      "flex flex-col items-center justify-center px-5 text-center",
      compact ? "py-4" : "min-h-80 py-12",
    )}>
      <span aria-hidden="true" className={cn(styles.imprint, compact && styles.compact)}>
        <span className={styles.imprintFace} />
      </span>
      <div role="alert" className="w-full max-w-sm">
        <h2 className={cn("font-semibold", compact ? "text-base" : "text-xl")}>
          {t("ErrorBoundary.loadFailed")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t("ErrorBoundary.loadFailedDescription")}
        </p>
      </div>
      <Button type="button" size="xl" className={cn("w-full max-w-44", compact ? "mt-4" : "mt-6")}
        disabled={retrying} onClick={onRetry}>
        {t(retrying ? "ActivityDetail.loading" : "ErrorBoundary.retry")}
      </Button>
    </div>
  );
}
