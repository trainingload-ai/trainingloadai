import type { Metadata } from "next";
import {
  OfficialPlanTemplateDetailPage,
  officialPlanTemplateMetadata,
} from "@/components/OfficialPlanTemplateDetailPage";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return officialPlanTemplateMetadata({ lang, slug: "target-10k" });
}

export default async function TenKTargetOfficialPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return <OfficialPlanTemplateDetailPage lang={lang} slug="target-10k" />;
}
