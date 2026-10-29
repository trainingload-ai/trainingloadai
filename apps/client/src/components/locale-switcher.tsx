"use client";
import { useLocale } from "next-intl";
import {
  Locale,
  localeNativeLabel,
  routing,
  usePathname,
  useRouter,
} from "@/i18n/routing";
import LocaleSwitcherSelect from "./locale-switcher-select";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useTransition } from "react";
import { useParams } from "next/navigation";
import { persistLocalePreference } from "@/lib/locale-preference";
import {
  localeNavigationHref,
  localeNavigationQuery,
  replaceBrowserLocation,
} from "@/lib/locale-navigation";

export default function LocaleSwitcher({
  ariaLabel,
  reloadOnLocaleChange = false,
}: {
  ariaLabel: string;
  reloadOnLocaleChange?: boolean;
}) {
  const locale = useLocale();

  const router = useRouter();
  const [, startTransition] = useTransition();
  const pathname = usePathname();
  const params = useParams();
  function onSelectChange(value: string) {
    const nextLocale = value as Locale;
    persistLocalePreference(nextLocale);
    if (reloadOnLocaleChange) {
      replaceBrowserLocation(
        localeNavigationHref(nextLocale, pathname, window.location.search),
      );
      return;
    }
    startTransition(() => {
      router.replace(
        {
          pathname,
          // @ts-expect-error -- The current route params match the current pathname.
          params,
          query: localeNavigationQuery(window.location.search),
        },
        { locale: nextLocale },
      );
    });
  }

  return (
    <LocaleSwitcherSelect ariaLabel={ariaLabel} defaultValue={locale}>
      {routing.locales.map((cur) => (
        <DropdownMenuItem key={cur} onClick={() => onSelectChange(cur)}>
          {localeNativeLabel(cur)}
        </DropdownMenuItem>
      ))}
    </LocaleSwitcherSelect>
  );
}
