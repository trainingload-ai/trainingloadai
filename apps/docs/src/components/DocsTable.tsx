"use client";

import { type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { ScrollableRegion } from "@/components/ScrollableRegion";

export function DocsTable(props: ComponentProps<"table">) {
  const t = useTranslations("accessibility");
  return (
    <ScrollableRegion
      label={props["aria-label"] ?? t("dataTable")}
      role="group"
      className="overflow-auto prose-no-margin my-6"
    >
      <table {...props} />
    </ScrollableRegion>
  );
}
