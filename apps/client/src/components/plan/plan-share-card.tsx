"use client";

import { useState } from "react";
import { Copy, Link2, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  createPlanShare,
  revokePlanShare,
  revokePlanShareLineage,
  type PlanShareResult,
  type TrainingPlanDetail,
} from "@/api/plans";
import { Button } from "@/components/ui/button";
import { ApiFetchError } from "@/lib/api";
import { toast } from "sonner";
import { getPlanSharePublicUrl } from "@/lib/config";

function shareUrl(publicId: string) {
  return getPlanSharePublicUrl(publicId);
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export function PlanShareCard({ plan }: { plan: TrainingPlanDetail }) {
  const t = useTranslations("V2PlanDetailPage.share");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<PlanShareResult | null>(null);

  const runShare = async () => {
    if (pending) return;
    setPending(true);
    try {
      const created = await createPlanShare(plan.id);
      if (!created) throw new Error("empty");
      setResult(created);
      toast.success(created.reused ? t("unchanged") : t("created"));
    } catch (error) {
      toast.error(
        error instanceof ApiFetchError ? error.message : t("failed"),
      );
    } finally {
      setPending(false);
    }
  };

  const copy = async (publicId: string, kind: "lineage" | "version") => {
    try {
      await copyText(shareUrl(publicId));
      toast.success(kind === "lineage" ? t("copiedLatest") : t("copiedVersion"));
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const revokeVersion = async () => {
    if (!result || pending) return;
    setPending(true);
    try {
      await revokePlanShare(result.share.publicId);
      setResult(null);
      toast.success(t("revokedVersion"));
    } catch (error) {
      toast.error(
        error instanceof ApiFetchError ? error.message : t("failed"),
      );
    } finally {
      setPending(false);
    }
  };

  const revokeLineage = async () => {
    if (!result || pending) return;
    setPending(true);
    try {
      await revokePlanShareLineage(result.lineage.publicId);
      setResult(null);
      toast.success(t("revokedLineage"));
    } catch (error) {
      toast.error(
        error instanceof ApiFetchError ? error.message : t("failed"),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="space-y-3 rounded-md border border-border/70 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Share2 className="h-4 w-4" />
        {t("title")}
      </div>
      {plan.derivedFromShareId ? (
        <p className="text-mobile-caption pc:text-xs text-muted-foreground">
          {t("derivedHint")}
        </p>
      ) : (
        <p className="text-mobile-caption pc:text-xs text-muted-foreground">
          {t("hint")}
        </p>
      )}
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        disabled={pending}
        onClick={() => void runShare()}
      >
        <Link2 className="h-4 w-4" />
        {pending ? t("pending") : result ? t("shareAgain") : t("share")}
      </Button>
      {result ? (
        <div className="space-y-2">
          <p className="text-mobile-caption pc:text-xs text-muted-foreground">
            {t("versionLabel", { version: result.share.version })}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="w-full justify-start"
            onClick={() => void copy(result.lineage.publicId, "lineage")}
          >
            <Copy className="h-4 w-4" />
            {t("copyLatest")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="w-full justify-start"
            onClick={() => void copy(result.share.publicId, "version")}
          >
            <Copy className="h-4 w-4" />
            {t("copyVersion")}
          </Button>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={pending}
              onClick={() => void revokeVersion()}
            >
              {t("revokeVersion")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-destructive hover:text-destructive"
              disabled={pending}
              onClick={() => void revokeLineage()}
            >
              {t("revokeLineage")}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
