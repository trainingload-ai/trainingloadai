"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { SiteErrorState } from "@/components/site-error-state";

export default function HomeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <SiteErrorState
      kind="server-error"
      digest={error.digest}
      onRetry={reset}
    />
  );
}
