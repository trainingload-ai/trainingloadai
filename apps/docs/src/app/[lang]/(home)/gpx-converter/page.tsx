import { permanentRedirect } from "next/navigation";
import { localePrefix } from "@/lib/locale-url";

/** SEO alias: “gpx converter” entry URL → canonical /converter */
export default async function GpxConverterAliasRedirect(props: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await props.params;
  const prefix = localePrefix(lang);
  permanentRedirect(`${prefix}/converter`);
}
