import { i18n } from "@/lib/i18n";
import { withLocalePath } from "@/lib/locale-url";
import {
  getDesktopReleases,
  getLatestDesktopDownload,
} from "@/lib/product-releases";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lang: string }> },
) {
  const { lang } = await params;
  if (!i18n.languages.some((locale) => locale === lang))
    return new Response(null, { status: 404 });

  const download = getLatestDesktopDownload((await getDesktopReleases()) ?? []);
  return new Response(null, {
    status: 307,
    headers: {
      location: download?.archiveUrl ?? withLocalePath(lang, "/download#macos"),
      "cache-control": "no-store",
    },
  });
}
