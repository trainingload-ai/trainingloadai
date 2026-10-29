import { permanentRedirect } from "next/navigation";
import { localePrefix } from "@/lib/locale-url";

export default async function EstimateCpRedirectPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  permanentRedirect(`${localePrefix(lang)}/ftp-calculator`);
}
