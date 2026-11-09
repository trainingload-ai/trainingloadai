"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useRuntimeCapabilities } from "@/api/runtime-capabilities";
import {
  personalRequest,
  usePersonalConnection,
} from "@/api/personal-integrations";
import type { PersonalProvider } from "@shared/personal-integrations";

type FocusResult = {
  status: string;
  jobId?: string | null;
  reason?: string;
};

/**
 * Page-focus short sync for Self-host personal providers. Server enforces the
 * ≥1 hour throttle and in-flight skip; this only fires when the tab is visible.
 */
export function PersonalFocusSync() {
  const t = useTranslations("PersonalIntegrations");
  const runtime = useRuntimeCapabilities();
  const selfHost = runtime.data?.deployment === "self-host";
  const garminEnabled =
    selfHost &&
    runtime.data?.capabilities["garmin-personal-api-key"]?.state === "enabled";
  const corosEnabled =
    selfHost &&
    runtime.data?.capabilities["coros-mcp"]?.state === "enabled";
  const garmin = usePersonalConnection("garmin", Boolean(garminEnabled));
  const coros = usePersonalConnection("coros", Boolean(corosEnabled));
  const busy = useRef(false);

  useEffect(() => {
    if (!selfHost) return;
    const providers: PersonalProvider[] = [];
    if (garminEnabled && garmin.data?.connected) providers.push("garmin");
    if (corosEnabled && coros.data?.connected) providers.push("coros");
    if (!providers.length) return;

    const run = async () => {
      if (busy.current || document.visibilityState !== "visible") return;
      busy.current = true;
      try {
        for (const provider of providers) {
          try {
            const result = await personalRequest<FocusResult>(
              provider,
              "/sync/focus",
              {},
            );
            if (result.status === "QUEUED" || result.status === "WAITING") {
              toast.success(t("focusSyncQueued"));
            }
          } catch {
            toast.error(t("focusSyncFailed"));
          }
        }
      } finally {
        busy.current = false;
      }
    };

    const onFocus = () => {
      void run();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [
    selfHost,
    garminEnabled,
    corosEnabled,
    garmin.data?.connected,
    coros.data?.connected,
    t,
  ]);

  return null;
}
