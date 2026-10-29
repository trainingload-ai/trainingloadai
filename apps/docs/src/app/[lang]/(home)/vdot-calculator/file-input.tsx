"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { ToolFileDropzone } from "@/components/ToolClientControls";
import { Button } from "@/components/ui/button";
import { estimateVdotFromActivity, type VdotWindowMode } from "@/lib/vdot-activity";
import type { ThresholdRecord } from "@/lib/threshold-records";
import styles from "./vdot-calculator.module.css";

export function VdotFileInput({
  active,
  onApply,
}: {
  active: boolean;
  onApply: (result: {
    distanceM: number;
    timeSec: number;
    filename: string;
  }) => void;
}) {
  const t = useTranslations("vdotCalculator.client.file");
  const [file, setFile] = useState<File | null>(null);
  const [records, setRecords] = useState<ThresholdRecord[]>([]);
  const [mode, setMode] = useState<VdotWindowMode>("best");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);

  useEffect(() => {
    if (!active) request.current += 1;
  }, [active]);

  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );

  async function selectFile(next: File | null) {
    const id = ++request.current;
    setFile(next);
    setRecords([]);
    setError("");
    setBusy(Boolean(next));
    if (!next) return;
    try {
      const { readThresholdFile } = await import("@/lib/threshold-file");
      const parsed = await readThresholdFile(next);
      if (id !== request.current) return;
      setRecords(parsed);
    } catch (err) {
      if (id !== request.current) return;
      const code =
        err instanceof Error && ["size", "format", "timestamps"].includes(err.message)
          ? err.message
          : "format";
      setError(t(`errors.${code}`));
    } finally {
      if (id === request.current) setBusy(false);
    }
  }

  function apply() {
    const estimate = estimateVdotFromActivity(records, mode);
    if (!estimate || !file) {
      setError(t("errors.window"));
      return;
    }
    setError("");
    onApply({
      distanceM: estimate.distanceM,
      timeSec: estimate.timeSec,
      filename: file.name,
    });
  }

  return (
    <div className={styles.filePanel}>
      <ToolFileDropzone
        file={file}
        onFileChange={selectFile}
        accept=".fit,.gpx,.tcx"
        pickStrong={t("pick")}
        pickRest={t("drop")}
        supported={t("formats")}
        dropzoneAria={t("pick")}
        removeFileAria={t("remove")}
        trackingTool="vdot_calculator"
      />
      {busy ? (
        <p role="status" className={styles.fileHint}>
          <Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden />
          {t("reading")}
        </p>
      ) : null}
      {records.length > 0 ? (
        <>
          <fieldset className={styles.modeRow}>
            <legend className="sr-only">{t("windowLegend")}</legend>
            {(["best", "whole"] as const).map((option) => (
              <label key={option} className={styles.modeOption}>
                <input
                  type="radio"
                  name="vdot-window"
                  checked={mode === option}
                  onChange={() => setMode(option)}
                />
                {t(option)}
              </label>
            ))}
          </fieldset>
          <p className={styles.fileHint}>{t("windowHint")}</p>
          <Button type="button" className={styles.submit} onClick={apply}>
            {t("apply")}
          </Button>
        </>
      ) : null}
      {error ? (
        <p role="alert" className={styles.alert}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
