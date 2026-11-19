import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  absoluteAlternatesForPath,
  absoluteLocalizedUrl,
} from "@/lib/locale-url";
import { homeOpenGraphImage, homeTwitterImage } from "@/lib/social-metadata";

export async function productReleaseMetadata(
  lang: string,
  path: "/download" | "/releases",
): Promise<Metadata> {
  const page = path === "/download" ? "download" : "history";
  const t = await getTranslations({
    locale: lang,
    namespace: `productReleases.${page}`,
  });
  const siteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.trainingload.ai";
  const url = absoluteLocalizedUrl(siteUrl, lang, path);
  const title = `${t("heading")} | Trainingload.ai`;
  const description = t("description");

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: absoluteAlternatesForPath(siteUrl, path),
    },
    openGraph: {
      type: "website",
      title,
      description,
      url,
      images: [homeOpenGraphImage()],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [homeTwitterImage()],
    },
  };
}
