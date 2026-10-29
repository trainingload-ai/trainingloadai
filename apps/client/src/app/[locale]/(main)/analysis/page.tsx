"use client";

import type { ComponentType } from "react";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Activity,
  ArrowRight,
  ChartNoAxesCombined,
  Heart,
  Search,
  Timer,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const toolGroups = [
  {
    key: "training",
    tools: [
      {
        key: "progression",
        href: null,
        icon: TrendingUp,
        status: "soon",
      },
      {
        key: "activityStats",
        href: "/activities/stats",
        icon: Activity,
      },
      {
        key: "pmc",
        href: "/pmc",
        icon: ChartNoAxesCombined,
      },
    ],
  },
  {
    key: "performance",
    tools: [
      {
        key: "bestDistance",
        href: "/pace/best-distance",
        icon: Trophy,
      },
      {
        key: "power",
        href: "/power",
        icon: Zap,
      },
      {
        key: "pace",
        href: "/pace",
        icon: Timer,
      },
      {
        key: "heartRate",
        href: "/heart-rate",
        icon: Heart,
      },
    ],
  },
] as const;

function ToolCard({
  title,
  description,
  href,
  icon: Icon,
  soonLabel,
  status,
}: {
  title: string;
  description: string;
  href: string | null;
  icon: ComponentType<{ className?: string }>;
  soonLabel: string;
  status?: "soon";
}) {
  const content = (
    <Card
      className={cn(
        "h-full rounded-md border-border/70 bg-background/80 p-2 transition-colors",
        href
          ? "hover:bg-neutral-50 dark:hover:bg-neutral-900"
          : "opacity-75",
      )}
    >
      <CardHeader className="space-y-0 p-3 pb-2">
        <CardTitle className="flex items-center justify-between gap-3 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{title}</span>
          </span>
          {status === "soon" ? (
            <Badge variant="secondary" className="shrink-0 rounded-md text-mobile-unit pc:text-[10px]">
              {soonLabel}
            </Badge>
          ) : (
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 text-mobile-caption pc:text-xs leading-5 text-muted-foreground">
        {description}
      </CardContent>
    </Card>
  );

  if (!href) return content;

  return (
    <Link href={href} className="block h-full focus:outline-hidden">
      {content}
    </Link>
  );
}

export default function AnalysisPage() {
  const t = useTranslations("AnalysisHubPage");
  const [query, setQuery] = useState("");
  useSetPageTitle(t("title"));

  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    if (!normalizedQuery) return toolGroups;

    return toolGroups
      .map((group) => {
        const groupTitle = t(`groups.${group.key}`).toLowerCase();
        const tools = group.tools.filter((tool) => {
          const title = t(`tools.${tool.key}.title`).toLowerCase();
          const description = t(`tools.${tool.key}.description`).toLowerCase();

          return [tool.key, group.key, groupTitle, title, description].some(
            (value) => value.includes(normalizedQuery),
          );
        });

        return { ...group, tools };
      })
      .filter((group) => group.tools.length > 0);
  }, [normalizedQuery, t]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-1 pb-4">
      <div className="rounded-md bg-neutral-100 px-3 py-3 dark:bg-muted/45">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-mobile-caption pc:text-xs font-medium uppercase text-muted-foreground">
              {t("eyebrow")}
            </p>
            <h1 className="text-xl font-semibold tracking-normal">
              {t("title")}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("description")}
            </p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-8 rounded-md bg-background pl-8 text-mobile-caption pc:text-xs"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {visibleGroups.map((group) => (
          <section key={group.key} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {t(`groups.${group.key}`)}
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.tools.map((tool) => (
                <ToolCard
                  key={tool.key}
                  title={t(`tools.${tool.key}.title`)}
                  description={t(`tools.${tool.key}.description`)}
                  href={tool.href}
                  icon={tool.icon}
                  status={"status" in tool ? tool.status : undefined}
                  soonLabel={t("soon")}
                />
              ))}
            </div>
          </section>
        ))}
        {visibleGroups.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/70 px-3 py-8 text-center text-sm text-muted-foreground">
            {t("noResults")}
          </div>
        ) : null}
      </div>
    </div>
  );
}
