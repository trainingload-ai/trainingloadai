import { permanentRedirect } from "next/navigation";
import { withLocalePath } from "@/lib/locale-url";

export default async function FitnessChartAliasPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  permanentRedirect(withLocalePath(lang, "/features/pmc-fitness-chart"));
}
