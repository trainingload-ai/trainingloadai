"use client";

import { ChevronDown, Globe } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "fumadocs-ui/components/ui/popover";
import { buildLocalePathname, LOCALE_OPTIONS } from "@/lib/locale-options";
import { persistLocalePreference } from "@/lib/locale-preference";

export function HeaderLocaleSwitcher({
  lang,
  pathname,
  query,
  showIcon = false,
}: {
  lang: string;
  pathname: string;
  query: string;
  showIcon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("header");
  const current =
    LOCALE_OPTIONS.find((option) => option.key === lang) ?? LOCALE_OPTIONS[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${t("language")}: ${current.shortLabel}`}
          className="flex min-h-9 items-center gap-1.5 rounded-control px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showIcon ? <Globe aria-hidden="true" className="size-3.5" /> : null}
          {current.shortLabel}
          <ChevronDown aria-hidden="true" className="size-3.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={t("language")}
        className="grid min-w-40 gap-1 rounded-control border-border bg-popover p-1 text-popover-foreground motion-reduce:animate-none"
      >
        {LOCALE_OPTIONS.map((option) => {
          const nextPath = buildLocalePathname(pathname, option.key);
          return (
            <Link
              key={option.key}
              href={query ? `${nextPath}?${query}` : nextPath}
              hrefLang={option.key}
              lang={option.key}
              prefetch={false}
              aria-current={option.key === lang ? "page" : undefined}
              onClick={() => {
                persistLocalePreference(option.key);
                setOpen(false);
              }}
              className="rounded-xs px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-secondary aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
            >
              {option.label}
            </Link>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
