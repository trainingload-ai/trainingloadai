import "server-only";

import { getApiBaseUrl } from "@/lib/config";

/**
 * Server-side BFF routes should use the private Docker network in production.
 * The public API URL remains the fallback for local and non-Docker runtimes.
 */
export function getServerApiBaseUrl(): string {
  return process.env.CLIENT_INTERNAL_API_URL?.trim() || getApiBaseUrl();
}
