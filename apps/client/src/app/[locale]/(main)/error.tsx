"use client";

import { useEffect } from "react";

import { AppErrorState } from "@/components/app-error-state";

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <AppErrorState
      kind="server-error"
      digest={error.digest}
      onRetry={reset}
    />
  );
}
