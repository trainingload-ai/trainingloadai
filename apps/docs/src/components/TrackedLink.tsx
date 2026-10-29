"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { trackMarketingEvent } from "@/lib/analytics";

export function TrackedLink({
  eventName,
  eventProperties,
  ...linkProps
}: Omit<ComponentProps<typeof Link>, "href" | "onClick"> & {
  href: string;
  eventName: string;
  eventProperties?: Record<
    string,
    string | number | boolean | null | undefined
  >;
}) {
  return (
    <Link
      {...linkProps}
      onClick={() => trackMarketingEvent(eventName, eventProperties)}
    />
  );
}
