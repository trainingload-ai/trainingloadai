import { ArrowRight, Check, Footprints, Sparkles } from "lucide-react";
import { TrackedLink } from "@/components/TrackedLink";

export const HOME_RUNNING_PLAN_ROUTES = [
  "/couch-to-5k-training-plan",
  "/5k-training-plan",
  "/10k-training-plan",
  "/half-marathon-training-plan",
  "/marathon-training-plan",
] as const;

export type HomeTrainingPlanSpotlightCopy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  browseAll: string;
  planCta: string;
  freeLabel: string;
  freeTitle: string;
  freeText: string;
  aiLabel: string;
  aiTitle: string;
  aiText: string;
  plans: Array<{
    marker: string;
    title: string;
    meta: string;
  }>;
};

const planTileLayouts = [
  "col-span-2 min-h-[15rem] md:col-span-7 md:min-h-[18rem] md:row-span-2",
  "col-span-1 min-h-[10rem] md:col-span-5 md:min-h-[9rem]",
  "col-span-1 min-h-[10rem] md:col-span-5 md:min-h-[9rem]",
  "col-span-1 min-h-[11rem] md:col-span-5 md:min-h-[10.5rem]",
  "col-span-1 min-h-[11rem] md:col-span-7 md:min-h-[10.5rem]",
] as const;

export function HomeTrainingPlanSpotlight({
  copy,
  prefix,
}: {
  copy: HomeTrainingPlanSpotlightCopy;
  prefix: string;
}) {
  const plans = HOME_RUNNING_PLAN_ROUTES.map((href, index) => ({
    ...copy.plans[index],
    href,
  })).filter((plan) => plan.title);

  return (
    <section
      id="free-running-plans"
      aria-labelledby="free-running-plans-title"
      className="marketing-section relative overflow-hidden bg-secondary/70 text-foreground"
    >
      <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-14">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="marketing-eyebrow inline-flex items-center gap-2">
            <Footprints aria-hidden="true" className="size-4" />
            {copy.eyebrow}
          </div>
          <h2
            id="free-running-plans-title"
            className="font-display mt-4 max-w-xl text-balance text-3xl font-bold leading-[1.06] tracking-[-0.025em] md:text-[2.5rem]"
          >
            {copy.title}
          </h2>
          <p className="mt-4 max-w-xl text-[15px] leading-7 text-muted-foreground md:text-base">
            {copy.subtitle}
          </p>

          <TrackedLink
            href={`${prefix}/plan`}
            eventName="home_plan_hub_click"
            eventProperties={{ placement: "free_plan_spotlight" }}
            className="mt-7 inline-flex h-11 items-center justify-center rounded-control bg-brand px-5 text-sm font-bold text-brand-foreground transition-colors hover:bg-brand/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-secondary"
          >
            {copy.browseAll}
            <ArrowRight aria-hidden="true" className="ml-2 size-4" />
          </TrackedLink>

          <div className="mt-9 divide-y divide-border border-y border-border">
            <div className="grid gap-3 py-5 sm:grid-cols-[7rem_1fr]">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-success">
                <Check aria-hidden="true" className="size-4" />
                {copy.freeLabel}
              </div>
              <div>
                <h3 className="font-bold">{copy.freeTitle}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {copy.freeText}
                </p>
              </div>
            </div>
            <div className="grid gap-3 py-5 sm:grid-cols-[7rem_1fr]">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-info">
                <Sparkles aria-hidden="true" className="size-4" />
                {copy.aiLabel}
              </div>
              <div>
                <h3 className="font-bold">{copy.aiTitle}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {copy.aiText}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative lg:pt-3">
          <ol className="grid grid-cols-2 gap-3 md:auto-rows-fr md:grid-cols-12">
            {plans.map((plan, index) => (
              <li
                key={plan.href}
                className={planTileLayouts[index] ?? "md:col-span-6"}
              >
                <TrackedLink
                  href={`${prefix}${plan.href}`}
                  eventName="home_plan_distance_click"
                  eventProperties={{
                    placement: "free_plan_spotlight",
                    target: plan.href,
                    position: index + 1,
                  }}
                  className={[
                    "group relative flex h-full min-h-full flex-col overflow-hidden p-4 transition-[background-color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5",
                    index === 0
                      ? "rounded-overlay bg-brand text-brand-foreground hover:-translate-y-0.5 hover:bg-brand/88"
                      : "rounded-surface bg-card text-card-foreground shadow-xs ring-1 ring-border/70 hover:-translate-y-0.5 hover:bg-muted",
                  ].join(" ")}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      "pointer-events-none absolute -right-2 -top-5 select-none font-black tabular-nums tracking-[-0.08em] transition-transform duration-300 group-hover:-translate-x-1",
                      index === 0
                        ? "text-[clamp(4.5rem,10vw,8.5rem)] text-brand-foreground/[0.1]"
                        : "text-[clamp(4rem,7vw,6.5rem)] text-foreground/[0.035]",
                    ].join(" ")}
                  >
                    {plan.marker}
                  </span>

                  <div className="relative z-10 flex items-start justify-between gap-4">
                    <span
                      className={[
                        "inline-flex min-h-8 items-center rounded-compact border px-2.5 text-xs font-black tabular-nums tracking-tight",
                        index === 0
                          ? "border-brand-foreground/20 bg-brand-foreground text-brand"
                          : "border-border bg-secondary text-foreground",
                      ].join(" ")}
                    >
                      {plan.marker}
                    </span>
                    <span
                      className={[
                        "grid size-9 place-items-center rounded-control border transition-transform duration-200 group-hover:translate-x-1",
                        index === 0
                          ? "border-brand-foreground/20 text-brand-foreground"
                          : "border-border text-muted-foreground group-hover:text-foreground",
                      ].join(" ")}
                    >
                      <ArrowRight aria-hidden="true" className="size-4" />
                    </span>
                  </div>

                  <div
                    className={[
                      "relative z-10 mt-auto",
                      index === 0 ? "pt-8" : "pt-5 sm:pt-8",
                    ].join(" ")}
                  >
                    <h3
                      className={[
                        "font-black leading-none tracking-tight",
                        index === 0
                          ? "max-w-sm text-4xl sm:text-5xl"
                          : "max-w-xs text-xl sm:text-3xl",
                      ].join(" ")}
                    >
                      {plan.title}
                    </h3>
                    <p
                      className={[
                        "mt-2 max-w-sm text-xs font-medium leading-5 sm:mt-3 sm:text-sm sm:leading-6",
                        index === 0
                          ? "text-brand-foreground/70"
                          : "text-muted-foreground",
                      ].join(" ")}
                    >
                      {plan.meta}
                    </p>
                  </div>

                  <span
                    className={[
                      "relative z-10 mt-5 text-xs font-black uppercase tracking-[0.14em]",
                      index === 0 ? "block" : "hidden sm:block",
                      index === 0
                        ? "text-brand-foreground/75"
                        : "text-muted-foreground",
                    ].join(" ")}
                  >
                    {copy.planCta}
                  </span>
                </TrackedLink>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
