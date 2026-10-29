"use client";

import { useTranslations } from "next-intl";
import { ProductPreview } from "./product-preview";
import { localePrefix } from "@/lib/locale-url";

export function ToolProductPreview({
  lang,
  kind = "files",
}: {
  lang: string;
  kind?: "files" | "load" | "plans";
}) {
  const t = useTranslations(`toolExperience.${kind}.hero`);
  const common = useTranslations("calculatorProduct");
  return (
    <ProductPreview
      lang={lang}
      title={t("title")}
      body={t("body")}
      href={`${localePrefix(lang)}/${kind === "load" ? "training-load" : "ai-training-plan"}`}
      cta={common("learnMore")}
    />
  );
}
