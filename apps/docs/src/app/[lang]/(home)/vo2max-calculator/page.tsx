import { redirect } from "next/navigation";
import { localePrefix } from "@/lib/locale-url";

export default async function LegacyVo2maxCalculatorRedirect(props: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await props.params;
  const prefix = localePrefix(lang);
  redirect(`${prefix}/vo2-max-calculator`);
}
