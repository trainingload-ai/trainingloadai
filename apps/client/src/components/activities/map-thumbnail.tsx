"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";

import {
  resolveMapThumbnailCandidates,
  resolveMapThumbnailUrl,
} from "@/lib/map-thumbnail";
import { cn } from "@/lib/utils";

export function MapThumbnail({
  className,
  darkUrl,
  fallback,
  lightUrl,
  sizes,
}: {
  className?: string;
  darkUrl?: string | null;
  fallback: ReactNode;
  lightUrl?: string | null;
  sizes: string;
}) {
  const resolvedLightUrl = resolveMapThumbnailUrl(lightUrl);
  const resolvedDarkUrl = resolveMapThumbnailUrl(darkUrl);
  const [lightFailed, setLightFailed] = useState(false);
  const [darkFailed, setDarkFailed] = useState(false);

  useEffect(() => {
    setLightFailed(false);
    setDarkFailed(false);
  }, [resolvedDarkUrl, resolvedLightUrl]);

  const candidates = resolveMapThumbnailCandidates({
    darkFailed,
    darkUrl: resolvedDarkUrl,
    lightFailed,
    lightUrl: resolvedLightUrl,
  });
  const sharedCandidate =
    candidates.light && candidates.light === candidates.dark
      ? candidates.light
      : null;

  const markFailed = (url: string) => {
    if (url === resolvedLightUrl) setLightFailed(true);
    if (url === resolvedDarkUrl) setDarkFailed(true);
  };

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-md bg-background dark:bg-black/20",
        className,
      )}
    >
      {sharedCandidate ? (
        <Image
          key={sharedCandidate}
          src={sharedCandidate}
          alt=""
          fill
          sizes={sizes}
          onError={() => markFailed(sharedCandidate)}
          className="object-cover"
        />
      ) : (
        <>
          {candidates.light ? (
            <Image
              key={`light-${candidates.light}`}
              src={candidates.light}
              alt=""
              fill
              sizes={sizes}
              onError={() => markFailed(candidates.light!)}
              className="object-cover dark:hidden"
            />
          ) : null}
          {candidates.dark ? (
            <Image
              key={`dark-${candidates.dark}`}
              src={candidates.dark}
              alt=""
              fill
              sizes={sizes}
              onError={() => markFailed(candidates.dark!)}
              className="hidden object-cover dark:block"
            />
          ) : null}
        </>
      )}
      {!candidates.light && !candidates.dark ? fallback : null}
    </div>
  );
}
