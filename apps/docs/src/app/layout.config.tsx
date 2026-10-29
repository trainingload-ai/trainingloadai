import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import Image from "next/image";
import { i18n } from "@/lib/i18n";

/**
 * Shared layout configurations
 *
 * you can customise layouts individually from:
 * Home Layout: app/(home)/layout.tsx
 * Docs Layout: app/docs/layout.tsx
 */

export function baseOptions(locale: string): BaseLayoutProps {
  return {
    i18n,
    nav: {
      title: (
        <>
          <Image
            src="/LOGO_LIGHT.svg"
            alt="Trainingload.ai"
            width={120}
            height={16}
            style={{ width: 120, height: "auto" }}
            className="hidden dark:block"
          />
          {/* Dark Mode Logo */}
          <Image
            src="/LOGO_DARK.svg"
            alt="Trainingload.ai"
            width={120}
            height={16}
            style={{ width: 120, height: "auto" }}
            className="block dark:hidden"
          />
        </>
      ),
      url: `/${locale}`,
    },
    // see https://fumadocs.dev/docs/ui/navigation/links
    links: [],
  };
}
