import type { MetadataRoute } from "next";

function getSiteUrl() {
  const raw =
    process.env.NEXT_PUBLIC_BASE_URL ??
    "https://www.trainingload.ai";
  return raw.replace(/\/+$/, "");
}

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/_next/static/", "/_next/image"],
        disallow: [
          "/api/",
          "/*.json$",
          "/*.md$",
          "/*.mdx$",
          "/404",
        ],
      },
      // Keep major search crawlers on HTML routes. Markdown file URLs are
      // either accidental docs surfaces or machine-readable AI endpoints.
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/*.md$", "/*.mdx$"],
      },
      {
        userAgent: "Bingbot",
        allow: "/",
        disallow: ["/*.md$", "/*.mdx$"],
      },
      { userAgent: "Google-Extended", allow: "/" },
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "ChatGPT-User", allow: "/" },
      { userAgent: "PerplexityBot", allow: "/" },
      { userAgent: "ClaudeBot", allow: "/" },
      { userAgent: "anthropic-ai", allow: "/" },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
