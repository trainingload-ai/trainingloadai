import type { Metadata } from "next";
import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { TriangleAlert } from "lucide-react";
import { localePrefix } from "@/lib/locale-url";
import { PlanSharePublicPage } from "@/components/plan-share/PlanSharePublicPage";
import { PlanSharePreviewError } from "@/lib/plan-share";
import { fetchPublicPlanSharePreview } from "@/lib/plan-share-server";

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai"
  ).replace(/\/+$/, "");
}

const loadPreview = cache(async (publicId: string) => {
  try {
    return {
      preview: await fetchPublicPlanSharePreview(publicId),
      error: null,
    };
  } catch (error) {
    const status = error instanceof PlanSharePreviewError ? error.status : 500;
    return { preview: null, error: status === 410 ? "gone" : "missing" };
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; publicId: string }>;
}): Promise<Metadata> {
  const { lang, publicId } = await params;
  const t = await getTranslations({ locale: lang, namespace: "planShare" });
  const { preview, error } = await loadPreview(publicId);
  const path = `/share/plans/${publicId}`;
  const url = `${siteUrl()}${localePrefix(lang)}${path}`;
  const title = preview?.title
    ? `${preview.title} · Trainingload.ai`
    : t(error === "gone" ? "goneTitle" : "errorTitle");
  const description = preview?.goal || preview?.description || t("takeHint");

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "website",
      url,
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    robots: { index: false, follow: false },
  };
}

export default async function SharePlanPage({
  params,
}: {
  params: Promise<{ lang: string; publicId: string }>;
}) {
  const { lang, publicId } = await params;
  const t = await getTranslations({ locale: lang, namespace: "planShare" });
  const { preview, error } = await loadPreview(publicId);

  if (!preview) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 md:px-6 md:py-16">
        <TriangleAlert className="h-7 w-7 text-amber-600" />
        <h1 className="mt-5 text-2xl font-bold">
          {error === "gone" ? t("goneTitle") : t("errorTitle")}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {error === "gone" ? t("goneText") : t("errorText")}
        </p>
      </div>
    );
  }

  return <PlanSharePublicPage preview={preview} lang={lang} />;
}
