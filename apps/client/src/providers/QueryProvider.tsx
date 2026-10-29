"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";

import { shouldRetryTransientQuery } from "@shared/runtime-reliability";
import {
  reportApiError,
  type ApiErrorNoticeContext,
} from "@/lib/api-error-notifier";

type ErrorPresentationMeta = {
  errorSurface?: "toast" | "inline" | "silent";
  errorScope?: string;
  errorMessage?: string;
};

type ErrorReporter = (
  error: unknown,
  context?: ApiErrorNoticeContext,
) => boolean;

function errorMeta(meta: Record<string, unknown> | undefined) {
  return (meta ?? {}) as ErrorPresentationMeta;
}

function currentErrorScope() {
  return typeof window === "undefined"
    ? "queries"
    : window.location.pathname || "queries";
}

export function createAppQueryClient(reportError: ErrorReporter = reportApiError) {
  const queryCache = new QueryCache({
    onError: (error, query) => {
      const meta = errorMeta(query.meta);
      if (meta.errorSurface === "silent" || meta.errorSurface === "inline") {
        return;
      }

      reportError(error, {
        scope: meta.errorScope || currentErrorScope(),
        surface: query.state.data === undefined ? "page" : "background",
        message: meta.errorMessage,
      });
    },
  });

  const mutationCache = new MutationCache({
    onError: (error, _variables, _onMutateResult, mutation) => {
      const meta = errorMeta(mutation.meta);
      // Mutations are user actions and usually have a more precise local
      // message. Global presentation is opt-in to avoid duplicate toasts.
      if (meta.errorSurface !== "toast") return;

      reportError(error, {
        scope: meta.errorScope || currentErrorScope(),
        surface: "action",
        message: meta.errorMessage,
      });
    },
  });

  return new QueryClient({
    queryCache,
    mutationCache,
    defaultOptions: {
      queries: {
        staleTime: 10000,
        gcTime: 0,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: shouldRetryTransientQuery,
        retryOnMount: false,
      },
    },
  });
}

export default function QueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(createAppQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
