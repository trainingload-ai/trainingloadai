"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { TrackFileInspection } from "@shared/track-file-contract";
import { DOCS_BROWSER_API_BASE_URL } from "@/lib/docs-api-base-url";

type InspectionState = {
  inspection: TrackFileInspection | null;
  isInspecting: boolean;
  inspectionError: string | null;
};

function responseMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const message = (payload as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message)) return message.map(String).join("; ");
  return null;
}

export function useTrackFileInspection() {
  const locale = useLocale();
  const t = useTranslations("fileInspection");
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<InspectionState>({
    inspection: null,
    isInspecting: false,
    inspectionError: null,
  });

  const inspectFile = useCallback(
    async (file: File | null) => {
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      abortRef.current?.abort();

      if (!file) {
        setState({
          inspection: null,
          isInspecting: false,
          inspectionError: null,
        });
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setState({
        inspection: null,
        isInspecting: true,
        inspectionError: null,
      });

      try {
        const formData = new FormData();
        formData.append("file", file, file.name);
        const response = await fetch(
          `${DOCS_BROWSER_API_BASE_URL}/public/inspect-activity-file`,
          {
            method: "POST",
            body: formData,
            headers: {
              "x-lang": locale,
            },
            signal: controller.signal,
          },
        );
        const payload = (await response.json()) as {
          data?: TrackFileInspection;
          message?: unknown;
        };
        if (!response.ok) {
          throw new Error(
            responseMessage(payload) ??
              t("failed", { status: response.status }),
          );
        }
        const inspection = payload.data ?? (payload as TrackFileInspection);
        if (requestId === requestIdRef.current) {
          setState({
            inspection,
            isInspecting: false,
            inspectionError: null,
          });
        }
      } catch (error) {
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }
        setState({
          inspection: null,
          isInspecting: false,
          inspectionError:
            error instanceof TypeError || error instanceof SyntaxError
              ? t("network")
              : error instanceof Error
                ? error.message
                : t("network"),
        });
      }
    },
    [locale, t],
  );

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  return { ...state, inspectFile };
}
