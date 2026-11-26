import { getTranslations } from "next-intl/server";
import { getRunningPlanScheduleCopy } from "@/components/RunningPlanSchedule";
import type { FiveKPreviewCopy } from "../5k-training-plan/_components/FiveKProductPreview";
import {
  TenKBridgePage,
  tenKBridgeMetadata,
} from "@/components/TenKBridgePage";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return tenKBridgeMetadata(lang, "couch-to-10k-training-plan");
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const [t, scheduleCopy] = await Promise.all([
    getTranslations({ locale: lang, namespace: "runningPlanPages" }),
    getRunningPlanScheduleCopy(lang),
  ]);
  return (
    <TenKBridgePage
      lang={lang}
      slug="couch-to-10k-training-plan"
      previewCopy={t.raw("productPreview") as FiveKPreviewCopy}
      scheduleCopy={scheduleCopy}
    />
  );
}
