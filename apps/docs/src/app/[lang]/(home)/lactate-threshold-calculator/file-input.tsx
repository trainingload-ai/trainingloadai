"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { ToolFileDropzone } from "@/components/ToolClientControls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  estimateThresholdWindow,
  type ThresholdRecord,
  type ThresholdFileMetric,
  type ThresholdFileEstimate,
} from "@/lib/threshold-records";
import styles from "./lactate-threshold-calculator.module.css";

export function ThresholdFileInput({
  metric,
  onResult,
  onReset,
}: {
  metric: ThresholdFileMetric;
  onResult: (result: ThresholdFileEstimate) => void;
  onReset: () => void;
}) {
  const t = useTranslations("lactateThresholdCalculator.client.file");
  const [file, setFile] = useState<File | null>(null);
  const [records, setRecords] = useState<ThresholdRecord[]>([]);
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  const duration = records.at(-1)?.seconds ?? 0;

  async function selectFile(next: File | null) {
    const id = ++request.current;
    onReset();
    setFile(next);
    setRecords([]);
    setError("");
    setDone(false);
    setBusy(Boolean(next));
    if (!next) return;
    try {
      const { readThresholdFile } = await import("@/lib/threshold-file");
      const parsed = await readThresholdFile(next);
      if (id !== request.current) return;
      const minutes = Math.floor(parsed.at(-1)!.seconds) / 60;
      setRecords(parsed);
      setStart(
        metric === "RACE" || metric === "PACE"
          ? "0"
          : String(
              Math.max(
                0,
                Math.floor(minutes - (metric === "HEART_RATE" ? 30 : 20)),
              ),
            ),
      );
      setEnd(String(Math.floor(minutes * 100) / 100));
    } catch (err) {
      if (id === request.current) {
        const code =
          err instanceof Error &&
          ["size", "format", "timestamps"].includes(err.message)
            ? err.message
            : "format";
        setError(t(`errors.${code}`));
      }
    } finally {
      if (id === request.current) setBusy(false);
    }
  }

  function calculate() {
    onReset();
    setDone(false);
    setError("");
    const estimate =
      start.trim() && end.trim()
        ? estimateThresholdWindow(
            records,
            metric,
            Number(start) * 60,
            Number(end) * 60,
          )
        : null;
    if (!estimate) {
      setError(t(`errors.${metric}`));
      return;
    }
    onResult(estimate);
    setDone(true);
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
        trackingTool="lactate_threshold_calculator"
      />
      {busy ? (
        <p role="status" className={styles.fileHint}>
          <Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden />
          {t("reading")}
        </p>
      ) : null}
      {records.length > 0 ? (
        <>
          <p className={styles.fileHint}>
            {t("duration", { minutes: (duration / 60).toFixed(1) })}
          </p>
          <div className={styles.effortGrid}>
            <div className={styles.field}>
              <Label htmlFor="lt-file-start">{t("start")}</Label>
              <Input
                id="lt-file-start"
                inputMode="decimal"
                value={start}
                onChange={(event) => {
                  setStart(event.target.value);
                  setDone(false);
                  onReset();
                }}
              />
            </div>
            <div className={styles.field}>
              <Label htmlFor="lt-file-end">{t("end")}</Label>
              <Input
                id="lt-file-end"
                inputMode="decimal"
                value={end}
                onChange={(event) => {
                  setEnd(event.target.value);
                  setDone(false);
                  onReset();
                }}
              />
            </div>
          </div>
          <p className={styles.fileHint}>{t(`method.${metric}`)}</p>
          <Button
            type="button"
            className={styles.primaryAction}
            onClick={calculate}
          >
            {t("calculate")}
          </Button>
        </>
      ) : null}
      {error ? (
        <p role="alert" className={styles.alert}>
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className={styles.fileSuccess}>
          {t("done")}
        </p>
      ) : null}
      <p className={styles.fileHint}>{t("privacy")}</p>
    </div>
  );
}
