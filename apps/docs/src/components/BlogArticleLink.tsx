"use client";

import Link from "next/link";
import type { ComponentPropsWithoutRef, MouseEvent } from "react";
import { trackMarketingEvent } from "@/lib/analytics";
import {
  blogLinkTrackingProperties,
  normalizeBlogLinkText,
} from "@/lib/blog-link-analytics";

type BlogArticleLinkProps = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  contentLanguage: string;
  href: string;
  sourceBlogSlug: string;
};

export function BlogArticleLink({
  contentLanguage,
  href,
  onClick,
  sourceBlogSlug,
  ...props
}: BlogArticleLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;

    trackMarketingEvent("blog_link_clicked", {
      ...blogLinkTrackingProperties({
        contentLanguage,
        href,
        sourceBlogSlug,
      }),
      link_text: normalizeBlogLinkText(event.currentTarget.textContent),
    });
  };

  return <Link href={href} onClick={handleClick} {...props} />;
}
