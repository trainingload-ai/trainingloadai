export async function sanitizeHtmlForBrowser(raw: string): Promise<string> {
  if (typeof window === "undefined") return "";

  const DOMPurify = await import("isomorphic-dompurify");
  return DOMPurify.default.sanitize(raw);
}
