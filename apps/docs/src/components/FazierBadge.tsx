"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { i18n } from "@/lib/i18n";
import { isSelfHostedDocs } from "@/lib/telemetry-config.mjs";

export function FazierBadge() {
  const pathname = usePathname();
  const isHomepage =
    pathname === "/" || i18n.languages.some((lang) => pathname === `/${lang}`);

  if (!isHomepage || isSelfHostedDocs()) return null;

  return (
    <a
      href="https://fazier.com"
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 inline-flex max-w-full rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring dark:bg-foreground dark:px-1.5 dark:py-1"
    >
      <Image
        src="https://fazier.com/api/v1/public/badges/launch_badges.svg?badge_type=launched&theme=neutral"
        alt="Launched on Fazier"
        width={103}
        height={44}
        unoptimized
        referrerPolicy="no-referrer"
        className="h-10 w-auto max-w-full"
      />
    </a>
  );
}
