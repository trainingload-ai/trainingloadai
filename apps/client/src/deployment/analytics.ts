"use client";

import {
  isSelfHostOperationEventName,
  toSelfHostGa4OperationName,
} from "@shared/product-analytics";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    __trainingloadTelemetryConsent?: boolean;
  }
}

type AnalyticsValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | AnalyticsValue[]
  | { [key: string]: AnalyticsValue };

export type AnalyticsProperties = Record<string, AnalyticsValue>;

export function cleanAnalyticsProperties(properties: AnalyticsProperties = {}) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value != null),
  ) as AnalyticsProperties;
}

export function isAnalyticsEnabled() {
  return (
    typeof window !== "undefined" &&
    window.__trainingloadTelemetryConsent === true &&
    typeof window.gtag === "function"
  );
}

export function track(
  eventName: string,
  _properties: AnalyticsProperties = {},
) {
  if (!isAnalyticsEnabled()) return;
  if (!isSelfHostOperationEventName(eventName)) return;

  // Intentionally do not forward call-site properties. Self-host telemetry is
  // an operation counter, not a channel for product, account, or training data.
  window.gtag?.("event", toSelfHostGa4OperationName(eventName), {
    deployment: "self_host",
    page_location: "https://self-host.invalid/",
    page_referrer: "",
  });
}

export function trackPageView(properties: AnalyticsProperties = {}) {
  track("$pageview", properties);
}

export function identify(
  _userId: string | null | undefined,
  _properties: AnalyticsProperties = {},
) {}

export function resetAnalytics() {}

export function initializeDeploymentAnalytics() {}

// Public builds do not load a hosted analytics SDK or project identifier.
export function GoogleAnalytics() { return null; }
