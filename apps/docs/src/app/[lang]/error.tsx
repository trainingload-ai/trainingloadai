"use client";

import * as Sentry from "@sentry/nextjs";
import { Suspense, useEffect } from "react";

import { CustomHeader } from "@/components/CustomHeader";
import { SiteErrorState } from "@/components/site-error-state";

export default function Error({
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
    <>
      <Suspense
        fallback={
          <div className="sticky top-0 z-50 h-16 w-full border-b border-neutral-300 bg-background/80 backdrop-blur-md dark:border-border" />
        }
      >
        <CustomHeader />
      </Suspense>
      <main className="flex-1">
        <SiteErrorState
          kind="server-error"
          digest={error.digest}
          onRetry={reset}
        />
      </main>
    </>
  );
}
