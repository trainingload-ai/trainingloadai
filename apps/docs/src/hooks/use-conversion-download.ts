"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type {
  TrackFileConversionReport,
  TrackFileFormat,
} from "@shared/track-file-contract";
import {
  conversionNeedsReview,
  downloadConversionBlob,
  invalidConversionResponse,
  readConversionReport,
} from "@/lib/conversion-download";

type PendingDownload = {
  blob: Blob;
  filename: string;
  report: TrackFileConversionReport;
  onDownloaded: () => void;
};

/** Warning results stay in memory until the user explicitly accepts the loss. */
export function useConversionDownload(targetFormat: TrackFileFormat) {
  const t = useTranslations("conversionQuality");
  const requestId = useRef(0);
  const pendingRef = useRef<PendingDownload | null>(null);
  const [pending, setPending] = useState<PendingDownload | null>(null);
  const [report, setReport] = useState<TrackFileConversionReport | null>(null);

  const reset = useCallback(() => {
    requestId.current += 1;
    pendingRef.current = null;
    setPending(null);
    setReport(null);
    return requestId.current;
  }, []);

  useEffect(
    () => () => {
      requestId.current += 1;
      pendingRef.current = null;
    },
    [],
  );

  const acceptResponse = useCallback(
    async (
      response: Response,
      filename: string,
      id: number,
      onDownloaded: (hasWarnings: boolean) => void,
    ) => {
      if (id !== requestId.current) return;
      const invalidMessage = t("outputInvalid");
      const report = readConversionReport(
        response.headers,
        targetFormat,
        invalidMessage,
      );
      const blob = await response.blob();
      if (id !== requestId.current) return;
      if (blob.size === 0) throw invalidConversionResponse(invalidMessage);
      if (conversionNeedsReview(report)) {
        setReport(report);
        const next = {
          blob,
          filename,
          report,
          onDownloaded: () => onDownloaded(true),
        };
        pendingRef.current = next;
        setPending(next);
      } else {
        downloadConversionBlob(blob, filename);
        onDownloaded(false);
      }
    },
    [targetFormat, t],
  );

  const downloadPending = useCallback(() => {
    const current = pendingRef.current;
    if (!current) return;
    pendingRef.current = null;
    setPending(null);
    downloadConversionBlob(current.blob, current.filename);
    current.onDownloaded();
  }, []);

  const isCurrent = useCallback((id: number) => id === requestId.current, []);

  return { pending, report, reset, acceptResponse, downloadPending, isCurrent };
}
