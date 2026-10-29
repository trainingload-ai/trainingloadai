"use client";

import { authClient } from "@/lib/auth";

export function useViewerSession() {
  return authClient.useSession();
}
