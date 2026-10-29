"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import type { AiDataConsentSource } from "@/api/ai-data-consent";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { AiDataConsentDialog } from "./AiDataConsentDialog";

export function AiDataConsentPrompt({
  className,
  source = "ACCOUNT_SETTINGS",
  variant = "default",
}: {
  className?: string;
  source?: AiDataConsentSource;
  variant?: "default" | "compact";
}) {
  const t = useTranslations("AiDataConsent");
  const [open, setOpen] = useState(false);
  const compact = variant === "compact";

  return (
    <>
      {compact ? (
        <section
          className={cn("rounded-md bg-muted/45 p-3", className)}
        >
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-background text-muted-foreground">
              <ShieldCheck className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-foreground">
                {t("title")}
              </h2>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                {t("summary")}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 w-full bg-background"
            onClick={() => setOpen(true)}
          >
            {t("reviewAction")}
          </Button>
        </section>
      ) : (
        <section
          className={cn("px-4 py-6 text-center", className)}
        >
          <span className="mx-auto grid size-10 place-items-center rounded-md bg-muted text-muted-foreground">
            <ShieldCheck className="size-[18px]" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-xl font-semibold tracking-normal text-foreground sm:text-2xl">
            {t("title")}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {t("summary")}
          </p>
          <Button
            type="button"
            className="mt-5 min-w-36"
            onClick={() => setOpen(true)}
          >
            {t("reviewAction")}
          </Button>
        </section>
      )}
      <AiDataConsentDialog
        open={open}
        source={source}
        onOpenChange={setOpen}
      />
    </>
  );
}
