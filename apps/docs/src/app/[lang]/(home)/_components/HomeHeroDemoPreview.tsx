"use client";

import { ArrowUpRight } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TrackedLink } from "@/components/TrackedLink";
import { ProductBrowserChrome } from "@/components/ProductBrowserChrome";
import {
  PUBLIC_DEMO_EMBED_CONTEXT_MESSAGE,
  PUBLIC_DEMO_FRAME_READY_MESSAGE,
} from "@shared/public-demo-policy";

export type HomeHeroDemoCopy = {
  fallback: string;
  open: string;
  title: string;
};

const READY_TIMEOUT_MS = 12_000;

export function HomeHeroDemoPreview({
  copy,
  demoUrl,
  lang,
}: {
  copy: HomeHeroDemoCopy;
  demoUrl: string;
  lang: string;
}) {
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { resolvedTheme } = useTheme();
  const demoOrigin = useMemo(() => new URL(demoUrl).origin, [demoUrl]);
  const previewLocale = ["en", "zh", "zh-hant", "ja"].includes(lang)
    ? lang
    : "en";

  const sendEmbedContext = useCallback(() => {
    if (
      !iframeRef.current?.contentWindow ||
      (resolvedTheme !== "dark" && resolvedTheme !== "light")
    ) {
      return;
    }
    iframeRef.current.contentWindow.postMessage(
      {
        type: PUBLIC_DEMO_EMBED_CONTEXT_MESSAGE,
        locale: lang,
        theme: resolvedTheme,
        version: 1,
      },
      demoOrigin,
    );
  }, [demoOrigin, lang, resolvedTheme]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (
        event.origin !== demoOrigin ||
        event.source !== iframeRef.current?.contentWindow ||
        typeof event.data !== "object"
      ) {
        return;
      }
      if (
        (event.data as { type?: unknown }).type !==
        PUBLIC_DEMO_FRAME_READY_MESSAGE
      ) {
        return;
      }
      setReady(true);
      setTimedOut(false);
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [demoOrigin]);

  useEffect(() => {
    if (ready) sendEmbedContext();
  }, [ready, sendEmbedContext]);

  useEffect(() => {
    if (ready) return;
    const timeout = window.setTimeout(
      () => setTimedOut(true),
      READY_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [ready]);

  return (
    <section
      aria-label={copy.title}
      className="overflow-hidden rounded-feature border border-border/80 bg-neutral-950 shadow-[0_32px_90px_-54px_rgba(25,27,24,0.62)] dark:shadow-black/75"
    >
      <ProductBrowserChrome
        address={demoOrigin.replace(/^https?:\/\//, "")}
        center={
          <TrackedLink
            href={demoUrl}
            target="_blank"
            rel="noopener noreferrer"
            eventName="home_public_demo_click"
            eventProperties={{ placement: "preview_chrome", lang }}
            aria-label={`${copy.open}: ${demoOrigin.replace(/^https?:\/\//, "")}`}
            className="block truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
          >
            {demoOrigin.replace(/^https?:\/\//, "")}
          </TrackedLink>
        }
      />

      <div className="relative h-[620px] overflow-hidden bg-neutral-100 dark:bg-neutral-950 sm:h-[680px] lg:h-[720px]">
        <div
          className={`absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none ${ready ? "opacity-0" : "opacity-100"}`}
          aria-hidden={ready}
          inert={ready}
        >
          <picture>
            <source
              media="(prefers-color-scheme: dark) and (max-width: 639px)"
              srcSet={`/5k-training-plan/mobile-home-dark-v2-${previewLocale}.png`}
            />
            <source
              media="(prefers-color-scheme: dark)"
              srcSet={`/5k-training-plan/web-home-dark-v2-${previewLocale}.png`}
            />
            <source
              media="(max-width: 639px)"
              srcSet={`/5k-training-plan/mobile-home-v2-${previewLocale}.png`}
            />
            {/* The app screenshots are already release-rendered PNG assets;
                picture avoids preloading four theme/breakpoint variants. */}
            <img
              src={`/5k-training-plan/web-home-v2-${previewLocale}.png`}
              alt=""
              width={1440}
              height={960}
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover object-top"
            />
          </picture>
          {timedOut ? (
            <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/20 p-4 text-foreground backdrop-blur-md dark:bg-black/55 sm:p-6">
              <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-overlay border border-border/80 bg-card/[0.94] p-5 text-center shadow-[0_24px_80px_-32px_rgba(25,27,24,0.58)] backdrop-blur-xl dark:bg-card/[0.9] dark:shadow-black/60 sm:p-6">
                <p className="text-sm leading-6 text-muted-foreground">
                  {copy.fallback}
                </p>
                <TrackedLink
                  href={demoUrl}
                  eventName="home_public_demo_click"
                  eventProperties={{ placement: "preview_fallback", lang }}
                  className="inline-flex min-h-10 w-fit items-center justify-center gap-1.5 rounded-control bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/88 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:translate-y-px"
                >
                  {copy.open}
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </TrackedLink>
              </div>
            </div>
          ) : null}
        </div>

        <iframe
          ref={iframeRef}
          src={demoUrl}
          title={copy.title}
          loading="eager"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
          tabIndex={ready ? 0 : -1}
          aria-hidden={!ready}
          className={`absolute inset-0 h-full w-full border-0 bg-background transition-opacity duration-300 motion-reduce:transition-none ${ready ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
        />
      </div>
    </section>
  );
}
