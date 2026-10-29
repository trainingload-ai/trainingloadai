"use client";

import { AppErrorState } from "@/components/app-error-state";
import { MainAppShell } from "@/components/layout/MainAppShell";

export function ClientNotFoundView() {
  return (
    <MainAppShell>
      <AppErrorState kind="not-found" />
    </MainAppShell>
  );
}

export function ClientErrorView({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <MainAppShell>
      <AppErrorState
        kind="server-error"
        digest={error.digest}
        onRetry={reset}
      />
    </MainAppShell>
  );
}
