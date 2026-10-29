import type { MetadataRoute } from "next";

// The app subdomain is the authenticated product surface: every route either
// requires a session or redirects to login. Page-level metadata already sets
// `noindex, nofollow`, but that only applies after a crawler fetches the page.
// Blocking at robots.txt keeps crawl budget on the marketing site and stops
// login/signup shells from competing with their www counterparts.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: "/",
      },
    ],
  };
}
