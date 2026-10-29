"use client";

import { useEffect } from "react";

import { ClientErrorView } from "@/components/ClientAppErrorView";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ClientErrorView error={error} reset={reset} />;
}
