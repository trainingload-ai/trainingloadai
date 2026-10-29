"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ThemeProvider } from "next-themes";

import "@/app/globals.css";

export default function RootGlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root application error", error);
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          enableColorScheme
          disableTransitionOnChange
        >
          <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
            <section className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm">
              <p className="text-sm font-medium text-destructive">
                Application error
              </p>
              <h1 className="mt-2 text-2xl font-semibold">
                The page could not be displayed
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Please try again. If the problem continues, return to the home
                page.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  Try again
                </button>
                <Link
                  href="/"
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium"
                >
                  Home
                </Link>
              </div>
              {error.digest ? (
                <p className="mt-5 break-all font-mono text-mobile-caption pc:text-xs text-muted-foreground">
                  Reference: {error.digest}
                </p>
              ) : null}
            </section>
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
