import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { TranslateFn } from "@/components/plan/detail/plan-detail-utils";

export function PlanDetailLoadingState() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 pb-2 pc:gap-3">
      <div className="rounded-md bg-neutral-100 p-2.5 dark:bg-muted/45">
        <div className="h-4 w-24 rounded-xs bg-background/80 dark:bg-black/20" />
        <div className="mt-3 h-6 w-52 rounded-xs bg-background/80 dark:bg-black/20" />
      </div>
      <div className="flex flex-col gap-2 pc:grid pc:grid-cols-[minmax(0,1fr)_320px] pc:items-start pc:gap-3">
        <div className="order-1 h-48 rounded-md bg-neutral-100 pc:col-start-2 pc:row-start-1 pc:order-none dark:bg-muted/45" />
        <div className="order-2 h-56 rounded-md bg-neutral-100 pc:col-start-2 pc:row-start-2 pc:order-none dark:bg-muted/45" />
        <div className="order-3 h-44 rounded-md bg-neutral-100 pc:col-start-2 pc:row-start-3 pc:order-none dark:bg-muted/45" />
        <div className="order-4 space-y-2 pc:col-start-1 pc:row-span-3 pc:row-start-1 pc:order-none">
          <div className="h-40 rounded-md bg-neutral-100 dark:bg-muted/45" />
          <div className="h-96 rounded-md bg-neutral-100 dark:bg-muted/45" />
        </div>
      </div>
    </div>
  );
}

export function PlanDetailNotFoundState({
  t,
  backHref,
}: {
  t: TranslateFn;
  backHref: "/plans" | "/plan?openLibrary=1";
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 pb-3">
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-mobile-caption pc:text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("notFound.backToPlans")}
        </Link>
      </div>
      <div className="rounded-md bg-neutral-100 p-6 dark:bg-muted/45">
        <div className="text-base font-semibold">{t("notFound.title")}</div>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("notFound.description")}
        </p>
      </div>
    </div>
  );
}
