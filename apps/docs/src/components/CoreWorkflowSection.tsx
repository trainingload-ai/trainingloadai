import { cn } from "fumadocs-ui/utils/cn";
import { getTranslations } from "next-intl/server";
import { FullBleedSplit } from "@/components/FullBleedSplit";
import { ProductVisualPlaceholder } from "@/components/ProductVisualPlaceholder";

const workflowVisuals = {
  dashboard: "assets/home.png",
  calendar: "assets/calendar.png",
  pmc: "assets/PMC.png",
  analysis: "assets/activity_ai.png",
} as const;

export async function CoreWorkflowSection({
  lang,
  className,
}: {
  lang: string;
  className?: string;
}) {
  const t = await getTranslations({ locale: lang, namespace: "coreWorkflow" });

  return (
    <section className={cn("mt-12 w-full md:mt-16", className)}>
      <div className="text-center px-4">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600 dark:text-emerald-300">
          {t("kicker")}
        </div>
        <h2 className="text-2xl md:text-3xl font-semibold text-neutral-900 dark:text-white">
          {t("title")}
        </h2>
        <p className="mt-3 text-base md:text-lg text-neutral-600 dark:text-neutral-300">
          {t("subtitle")}
        </p>
      </div>

      <div className="mt-12 flex flex-col">
        <FullBleedSplit
          dominant="left"
          left={
            <ProductVisualPlaceholder
              label={t("dashboard.title")}
              subtitle={t("visualSubtitle")}
              imageSrc={workflowVisuals.dashboard}
              imageAlt={t("dashboard.title")}
              className="w-full"
            />
          }
          right={
            <div className="space-y-2 flex flex-col gap-4">
              <div className="flex gap-4">
                <h3 className="text-xl md:text-2xl font-bold text-neutral-900 dark:text-white">
                  {t("dashboard.title")}
                </h3>
              </div>
              <p className="text-base md:text-lg text-muted-foreground dark:text-neutral-300 leading-relaxed">
                {t("dashboard.description")}
              </p>
            </div>
          }
        />

        <FullBleedSplit
          dominant="right"
          background="muted"
          left={
            <div className="space-y-2 flex flex-col gap-4">
              <div className="flex gap-4">
                <h3 className="text-xl md:text-2xl font-bold text-neutral-900 dark:text-white">
                  {t("calendar.title")}
                </h3>
              </div>
              <p className="text-base md:text-lg text-muted-foreground dark:text-neutral-300 leading-relaxed">
                {t("calendar.description")}
              </p>
            </div>
          }
          right={
            <ProductVisualPlaceholder
              label={t("calendar.title")}
              subtitle={t("visualSubtitle")}
              imageSrc={workflowVisuals.calendar}
              imageAlt={t("calendar.title")}
              className="w-full"
            />
          }
        />

        <FullBleedSplit
          dominant="left"
          background="white"
          left={
            <ProductVisualPlaceholder
              label={t("pmc.title")}
              subtitle={t("visualSubtitle")}
              imageSrc={workflowVisuals.pmc}
              imageAlt={t("pmc.title")}
              className="w-full"
            />
          }
          right={
            <div className="space-y-2 flex flex-col gap-4">
              <div className="flex gap-4">
                <h3 className="text-xl md:text-2xl font-bold text-neutral-900 dark:text-white">
                  {t("pmc.title")}
                </h3>
              </div>
              <p className="text-base md:text-lg text-muted-foreground dark:text-neutral-300 leading-relaxed">
                {t("pmc.description")}
              </p>
            </div>
          }
        />

        <FullBleedSplit
          dominant="right"
          background="muted"
          left={
            <div className="space-y-2 flex flex-col gap-4">
              <div className="flex gap-4">
                <h3 className="text-xl md:text-2xl font-bold text-neutral-900 dark:text-white">
                  {t("analysis.title")}
                </h3>
              </div>
              <p className="text-base md:text-lg text-muted-foreground dark:text-neutral-300 leading-relaxed">
                {t("analysis.description")}
              </p>
            </div>
          }
          right={
            <ProductVisualPlaceholder
              label={t("analysis.title")}
              subtitle={t("visualSubtitle")}
              imageSrc={workflowVisuals.analysis}
              imageAlt={t("analysis.title")}
              className="w-full"
            />
          }
        />
      </div>
    </section>
  );
}
