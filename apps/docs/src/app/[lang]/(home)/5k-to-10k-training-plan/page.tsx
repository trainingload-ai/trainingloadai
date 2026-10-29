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
  return tenKBridgeMetadata(lang, "5k-to-10k-training-plan");
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return <TenKBridgePage lang={lang} slug="5k-to-10k-training-plan" />;
}
