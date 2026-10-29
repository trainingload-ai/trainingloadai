import "server-only";
import { getDocsServerApiBaseUrl } from "./docs-server-api-base-url";
import {
  isPlanSharePublicId,
  PlanSharePreviewError,
  type PublicPlanSharePreview,
  unwrapPlanSharePreview,
} from "./plan-share";

async function fetchPreviewPath(path: string): Promise<PublicPlanSharePreview> {
  const response = await fetch(`${getDocsServerApiBaseUrl()}${path}`, {
    method: "GET",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (response.status === 410 || response.status === 404) {
    throw new PlanSharePreviewError(response.status);
  }
  if (!response.ok) {
    throw new PlanSharePreviewError(response.status);
  }
  const preview = unwrapPlanSharePreview(await response.text());
  if (!preview) throw new PlanSharePreviewError(502);
  return preview;
}

export async function fetchPublicPlanSharePreview(publicId: string) {
  if (!isPlanSharePublicId(publicId)) {
    throw new PlanSharePreviewError(404);
  }
  try {
    return await fetchPreviewPath(
      `/public/plan-share-lineages/${encodeURIComponent(publicId)}`,
    );
  } catch (error) {
    if (error instanceof PlanSharePreviewError && error.status === 404) {
      return fetchPreviewPath(
        `/public/plan-shares/${encodeURIComponent(publicId)}`,
      );
    }
    throw error;
  }
}
