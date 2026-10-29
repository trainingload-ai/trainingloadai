import { permanentRedirect } from "next/navigation";
import { withLocalePath } from "@/lib/locale-url";

export default async function LegacyFitViewPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  permanentRedirect(withLocalePath(lang, "/fit-file-viewer"));
}
