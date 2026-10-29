"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import {
  getViewerPlanSharePreview,
  importPlanShare,
  type PlanSharePreview,
} from "@/api/plans";
import { ApiFetchError } from "@/lib/api";
import { PlanSharePublicView } from "@/components/plan/plan-share-public-view";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";

export default function PlanShareImportPage() {
  const t = useTranslations("PlanShareImportPage");
  const params = useParams<{ publicId: string }>();
  const router = useRouter();
  const [preview, setPreview] = useState<PlanSharePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState<"import" | "share" | null>(null);
  const [importError, setImportError] = useState("");
  useSetPageTitle(preview?.title || t("title"));

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    setGone(false);
    try {
      const result = await getViewerPlanSharePreview(params.publicId);
      if (!result) throw new Error("empty");
      setPreview(result);
    } catch (error) {
      setPreview(null);
      if (error instanceof ApiFetchError && error.status === 410) {
        setGone(true);
        return;
      }
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [params.publicId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirm(share: boolean) {
    if (confirming) return;
    setConfirming(share ? "share" : "import");
    setImportError("");
    try {
      const result = await importPlanShare(params.publicId, share);
      if (!result?.plan?.id) throw new Error("empty");
      router.replace(`/plans/${result.plan.id}`);
    } catch {
      setImportError(t("importError"));
      setConfirming(null);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center p-6">
        <div
          role="status"
          className="flex items-center gap-3 text-sm text-muted-foreground"
        >
          <LoaderCircle className="h-5 w-5 animate-spin" />
          {t("loading")}
        </div>
      </main>
    );
  }

  if (gone || failed || !preview) {
    return (
      <main className="mx-auto max-w-3xl p-6 py-16">
        <TriangleAlert className="h-7 w-7 text-amber-600" />
        <h1 className="mt-5 text-2xl font-bold">
          {gone ? t("goneTitle") : t("errorTitle")}
        </h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          {gone ? t("goneText") : t("errorText")}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            {t("retry")}
          </button>
          <Link
            href="/plans"
            className="rounded-lg border px-4 py-2 text-sm font-semibold"
          >
            {t("backToPlans")}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <PlanSharePublicView
      preview={preview}
      variant="import"
      confirming={confirming}
      importError={importError}
      onImport={(share) => void confirm(share)}
    />
  );
}
