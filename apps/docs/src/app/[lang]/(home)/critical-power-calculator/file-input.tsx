"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { ToolFileDropzone } from "@/components/ToolClientControls";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type CpEffortDraft } from "@/lib/critical-power";
import { cpDraftsFromFileResponse } from "@/lib/cp-file-result";
import {
  appendErrorReference,
  buildToolRequestError,
  createClientTraceId,
} from "@/lib/tool-request-error";
import { trackToolEvent } from "@/lib/tool-analytics";
import { DOCS_BROWSER_API_BASE_URL } from "@/lib/docs-api-base-url";
import styles from "./critical-power-calculator.module.css";

export function CpFileInput({
  onResult,
  active,
}: {
  active: boolean;
  onResult: (
    efforts: [CpEffortDraft, CpEffortDraft, CpEffortDraft],
    fileName: string,
  ) => void;
}) {
  const t = useTranslations("criticalPowerCalculator.page.file");
  const shared = useTranslations("estimateCp.page");
  const locale = useLocale();
  const [file, setFile] = useState<File | null>(null);
  const [method, setMethod] = useState("three_nine");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!active) request.current?.abort();
  }, [active]);

  function reset() {
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setError(null);
    setDone(false);
  }

  async function analyze() {
    if (!file || busy) return;
    const controller = new AbortController();
    request.current = controller;
    const clientTraceId = createClientTraceId("cp");
    const body = new FormData();
    body.append("files", file, file.name);
    body.append("testType", method);
    body.append("sportType", "CYCLING");
    setBusy(true);
    setError(null);
    setDone(false);
    trackToolEvent("tool_started", "critical_power_calculator", {
      action: "estimate_cp_file",
    });
    try {
      const response = await fetch(
        `${DOCS_BROWSER_API_BASE_URL}/public/estimate-cp`,
        {
          method: "POST",
          body,
          signal: controller.signal,
          headers: { "x-lang": locale, "x-client-trace-id": clientTraceId },
        },
      );
      if (!response.ok)
        throw await buildToolRequestError(
          response,
          shared("errors.requestFailed", { status: response.status }),
          clientTraceId,
        );
      const drafts = cpDraftsFromFileResponse(await response.json());
      if (!drafts) throw new Error(t("invalidResult"));
      if (controller.signal.aborted) return;
      onResult(drafts, file.name);
      setDone(true);
      trackToolEvent("tool_completed", "critical_power_calculator", {
        action: "estimate_cp_file",
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      const message =
        err instanceof TypeError
          ? shared("errors.network")
          : err instanceof Error
            ? err.message
            : shared("errors.unknown");
      setError(appendErrorReference(message, clientTraceId));
      trackToolEvent("tool_failed", "critical_power_calculator", {
        action: "estimate_cp_file",
        error_code: "response_invalid",
      });
    } finally {
      if (request.current === controller) {
        setBusy(false);
        request.current = null;
      }
    }
  }

  return (
    <div className={styles.filePanel}>
      <p className={styles.boardLead}>{t("lead")}</p>
      <div className={styles.field}>
        <Label htmlFor="cp-file-method">{t("method")}</Label>
        <Select
          value={method}
          onValueChange={(value) => {
            reset();
            setMethod(value);
          }}
        >
          <SelectTrigger id="cp-file-method" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="three_nine">{t("short")}</SelectItem>
            <SelectItem value="thirty_min">{t("long")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ToolFileDropzone
        file={file}
        accept=".fit,.tcx,.gpx"
        trackingTool="critical_power_calculator"
        pickStrong={shared("upload.pickStrong")}
        pickRest={shared("upload.pickRest")}
        supported={t("supported")}
        onFileChange={(next) => {
          reset();
          setFile(next);
        }}
        dropzoneAria={shared("upload.dropzoneAria")}
        supportedId="cp-file-supported"
        removeFileAria={
          file
            ? shared("upload.removeFileAria", { filename: file.name })
            : undefined
        }
      />
      {error ? (
        <p role="alert" className={styles.alert}>
          {error}
        </p>
      ) : null}
      <Button
        className={`${styles.primaryAction} w-full`}
        disabled={!file || busy}
        onClick={analyze}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : null}
        {t(busy ? "analyzing" : "analyze")}
      </Button>
      {done ? (
        <p role="status" className={styles.fileSuccess}>
          {t("done")} <a href="#result">{t("viewResult")} →</a>
        </p>
      ) : null}
      <p className={styles.fileHint}>{t("hint")}</p>
    </div>
  );
}
