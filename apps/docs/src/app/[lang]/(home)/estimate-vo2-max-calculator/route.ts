import { localePrefix } from "@/lib/locale-url";

export const dynamic = "force-dynamic";

async function replacementRedirect(params: Promise<{ lang: string }>) {
  const { lang } = await params;
  return new Response(null, {
    status: 308,
    headers: {
      location: `${localePrefix(lang)}/vo2-max-calculator`,
      "cache-control": "public, max-age=86400",
    },
  });
}

export function GET(
  _request: Request,
  { params }: { params: Promise<{ lang: string }> },
) {
  return replacementRedirect(params);
}

export function HEAD(
  _request: Request,
  { params }: { params: Promise<{ lang: string }> },
) {
  return replacementRedirect(params);
}
