import "server-only";

function normalizeApiBaseUrl(value: string, name: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL`);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(
      `${name} must be an origin-only HTTP(S) URL without credentials, query, or fragment`,
    );
  }
  return url.toString().replace(/\/+$/, "");
}

export function getDocsServerApiBaseUrl() {
  const internal = process.env.DOCS_INTERNAL_API_URL?.trim();
  if (internal) return normalizeApiBaseUrl(internal, "DOCS_INTERNAL_API_URL");

  const publicApi = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (publicApi) return normalizeApiBaseUrl(publicApi, "NEXT_PUBLIC_API_URL");

  return "http://localhost:3001";
}
