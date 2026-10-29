export type BlogLinkDestinationType =
  | "article_anchor"
  | "external_reference"
  | "internal_blog"
  | "internal_product"
  | "product_app";

const MARKETING_HOSTS = new Set(["trainingload.ai", "www.trainingload.ai"]);

function stripSearchAndHash(href: string) {
  if (href.startsWith("/")) return href.split(/[?#]/, 1)[0] || "/";

  try {
    const url = new URL(href);
    return `${url.origin}${url.pathname}`;
  } catch {
    return href.split(/[?#]/, 1)[0] || href;
  }
}

function isBlogPath(pathname: string) {
  return /^\/(?:[a-z]{2}(?:-[a-z]+)?\/)?blog(?:\/|$)/i.test(pathname);
}

export function classifyBlogLinkDestination(
  href: string,
): BlogLinkDestinationType {
  if (href.startsWith("#")) return "article_anchor";

  if (href.startsWith("/")) {
    return isBlogPath(href) ? "internal_blog" : "internal_product";
  }

  try {
    const url = new URL(href);
    if (url.hostname === "app.trainingload.ai") return "product_app";
    if (MARKETING_HOSTS.has(url.hostname)) {
      return isBlogPath(url.pathname) ? "internal_blog" : "internal_product";
    }
  } catch {
    // Non-URL values are treated as references rather than exposing them as
    // product destinations in analytics.
  }

  return "external_reference";
}

export function blogLinkTrackingProperties({
  contentLanguage,
  href,
  sourceBlogSlug,
}: {
  contentLanguage: string;
  href: string;
  sourceBlogSlug: string;
}) {
  return {
    event_schema_version: "1.0",
    source_blog_slug: sourceBlogSlug,
    content_language: contentLanguage,
    destination_path: stripSearchAndHash(href),
    destination_type: classifyBlogLinkDestination(href),
    link_location: "article_body",
  } as const;
}

export function normalizeBlogLinkText(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 120) : undefined;
}
