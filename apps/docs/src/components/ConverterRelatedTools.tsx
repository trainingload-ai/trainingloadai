"use client";

import { FileChartColumn, Map as MapIcon, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { ToolRelatedCards } from "@/components/ToolPageLayout";
import type { ToolCatalogCardProps } from "@/components/ToolCatalogCard";
import {
  groupRelatedConverterDirections,
  type ConverterDirection,
} from "@/lib/converter-directions";
import { withLocalePath } from "@/lib/locale-url";

export function ConverterRelatedTools({
  directions,
  currentDirection,
  lang,
}: {
  directions: ConverterDirection[];
  currentDirection?: ConverterDirection;
  lang: string;
}) {
  const tTools = useTranslations("tools.page");
  const tViewer = useTranslations("fitFileViewer");
  const tCommon = useTranslations("commonLinks");
  const ui = (currentDirection ?? directions[0])?.ui;
  if (!ui) return null;

  const outputLabel = tTools("ui.output");
  const directionCard = (
    item: ConverterDirection,
    signal = `${item.sourceInfo.label} → ${item.targetInfo.label}`,
  ): ToolCatalogCardProps => ({
    href: withLocalePath(lang, `/${item.slug}`),
    toolKey: item.slug,
    title: item.ui.linkLabel,
    description: item.subtitle,
    icon: RefreshCw,
    signal,
    output: { label: outputLabel, value: item.targetInfo.label },
  });
  const items: ToolCatalogCardProps[] = [];
  if (currentDirection) {
    const { sameFrom, sameTo } = groupRelatedConverterDirections(
      currentDirection,
      directions,
    );
    items.push(
      ...sameFrom.map((item) => directionCard(item, ui.relatedSameFromTitle)),
      ...sameTo.map((item) => directionCard(item, ui.relatedSameToTitle)),
      {
        href: withLocalePath(lang, "/converter"),
        toolKey: "converter",
        title: ui.relatedHub,
        description: tTools("converter.description"),
        icon: RefreshCw,
        signal: ui.relatedHubTitle,
        output: {
          label: outputLabel,
          value: tTools("toolDetails.converter.output"),
        },
      },
    );
  } else {
    items.push(...directions.map((item) => directionCard(item)));
  }
  items.push(
    {
      href: withLocalePath(lang, "/fit-file-viewer"),
      toolKey: "fitFileViewer",
      title: ui.relatedFitViewer,
      description: tViewer("hub.description"),
      icon: FileChartColumn,
      signal: currentDirection ? ui.relatedOtherTitle : "FIT VIEW",
      output: { label: outputLabel, value: tViewer("hub.output") },
    },
    {
      href: withLocalePath(lang, "/fit-course-converter"),
      toolKey: "fitCourseConverter",
      title: ui.relatedFitCourse,
      description: tTools("fitCourseConverter.description"),
      icon: MapIcon,
      tone: "var(--success)",
      signal: currentDirection ? ui.relatedOtherTitle : "FIT Course",
      output: {
        label: outputLabel,
        value: tTools("toolDetails.fitCourseConverter.output"),
      },
    },
  );

  return (
    <ToolRelatedCards
      id="other-tools"
      title={ui.otherToolsTitle}
      items={items}
      more={{
        href: withLocalePath(lang, "/tools"),
        label: tCommon("allToolsAction"),
      }}
    />
  );
}
