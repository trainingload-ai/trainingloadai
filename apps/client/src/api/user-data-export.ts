import { apiFetch } from "@/lib/api";
import type {
  UserDataExportJobDto,
  UserDataExportLocationPrivacy,
  UserDataExportMode,
} from "@shared/user-data-export";

export async function listUserDataExports() {
  return (
    (await apiFetch<UserDataExportJobDto[]>("/users/data-exports", {
      suppressErrorToast: true,
    })) ?? []
  );
}

export async function createUserDataExport(input: {
  mode: UserDataExportMode;
  locationPrivacy: UserDataExportLocationPrivacy;
  includeOriginalFiles: boolean;
}) {
  const idempotencyKey = `web-export-${crypto.randomUUID()}`;
  return await apiFetch<UserDataExportJobDto>("/users/data-exports", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
    suppressErrorToast: true,
  });
}

export async function deleteUserDataExport(id: string) {
  return await apiFetch<{ deleted: true }>(`/users/data-exports/${id}`, {
    method: "DELETE",
    suppressErrorToast: true,
  });
}

export function userDataExportDownloadUrl(id: string) {
  return `/api/proxy/users/data-exports/${encodeURIComponent(id)}/download`;
}
