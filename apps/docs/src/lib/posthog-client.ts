import type { PostHog } from "posthog-js/dist/module.slim.js";
import { isDocsTelemetryEnabled } from "./telemetry-config.mjs";

type PostHogProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

let postHogClientPromise: Promise<PostHog | null> | null = null;

export function isPostHogEnabled() {
  return (
    process.env.NODE_ENV === "production" &&
    typeof window !== "undefined" &&
    isDocsTelemetryEnabled() &&
    Boolean(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN)
  );
}

function stripUrlSearchAndHash(value: unknown) {
  if (typeof value !== "string") return value;

  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function loadPostHogClient() {
  if (!isPostHogEnabled()) return Promise.resolve(null);
  if (postHogClientPromise) return postHogClientPromise;

  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

  const clientPromise = import("posthog-js/dist/module.slim.js")
    .then(({ default: posthog }) => {
      if (!token) return null;

      posthog.init(token, {
        api_host: host,
        defaults: "2026-01-30",
        capture_pageview: false,
        capture_pageleave: false,
        autocapture: false,
        disable_session_recording: true,
        disable_surveys: true,
        disable_web_experiments: true,
        advanced_disable_feature_flags: true,
        person_profiles: "identified_only",
        cross_subdomain_cookie: true,
        respect_dnt: true,
        before_send: (event) => {
          if (event?.properties) {
            for (const property of [
              "$current_url",
              "$referrer",
              "$initial_referrer",
            ]) {
              event.properties[property] = stripUrlSearchAndHash(
                event.properties[property],
              );
            }
          }

          return event;
        },
      });

      return posthog;
    })
    .catch(() => {
      postHogClientPromise = null;
      return null;
    });

  postHogClientPromise = clientPromise;
  return clientPromise;
}

export function capturePostHogEvent(
  eventName: string,
  properties: PostHogProperties,
) {
  if (!isPostHogEnabled()) return;

  void loadPostHogClient().then((posthog) => {
    try {
      posthog?.capture(eventName, properties);
    } catch {
      // Analytics must never block the user path.
    }
  });
}
