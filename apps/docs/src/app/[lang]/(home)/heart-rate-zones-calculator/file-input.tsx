"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { ToolFileDropzone } from "@/components/ToolClientControls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  activitySamplesFromRecords,
  estimateActivityLthr,
  estimateLthrAtWindow,
  observeMaxHeartRate,
  type HeartRateSample,
} from "@/lib/heart-rate-activity";
import styles from "./heart-rate-zones-calculator.module.css";

export type HeartRateFileEstimate = {
  filename: string;
  lthr: number | null;
  rawMean: number | null;
  maxHr: number | null;
  maxHrInstantaneous: boolean;
  windowStartSec: number | null;
  windowEndSec: number | null;
  explicit: boolean;
};

function formatMinutes(seconds: number) {
  return String(Math.round((seconds / 60) * 100) / 100);
}

export function HeartRateFileInput({
  onResult,
  onReset,
}: {
  onResult: (result: HeartRateFileEstimate) => void;
  onReset: () => void;
}) {
  const t = useTranslations("heartRateZonesCalculator.client.file");
  const [file, setFile] = useState<File | null>(null);
  const [samples, setSamples] = useState<HeartRateSample[]>([]);
  const [filename, setFilename] = useState("");
  const [start, setStart] = useState("");
  const [autoStart, setAutoStart] = useState<number | null>(null);
  const [maxHr, setMaxHr] = useState<number | null>(null);
  const [maxHrInstantaneous, setMaxHrInstantaneous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);

  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );

  const duration = samples.at(-1)?.seconds ?? 0;

  function publish(
    nextSamples: HeartRateSample[],
    name: string,
    startSec: number | null,
    explicit: boolean,
    observedMax: number | null,
    instantaneous: boolean,
  ) {
    const window =
      startSec == null ? null : estimateLthrAtWindow(nextSamples, startSec);
    onResult({
      filename: name,
      lthr: window?.value ?? null,
      rawMean: window?.rawMean ?? null,
      maxHr: observedMax,
      maxHrInstantaneous: instantaneous,
      windowStartSec: window?.windowStartSec ?? null,
      windowEndSec: window?.windowEndSec ?? null,
      explicit,
    });
    if (startSec != null && !window) setError(t("errors.quality"));
  }

  async function selectFile(next: File | null) {
    const id = ++request.current;
    onReset();
    setFile(next);
    setSamples([]);
    setFilename("");
    setStart("");
    setAutoStart(null);
    setMaxHr(null);
    setError("");
    setBusy(Boolean(next));
    if (!next) return;
    try {
      const { readThresholdFile } = await import("@/lib/threshold-file");
      const parsed = await readThresholdFile(next);
      if (id !== request.current) return;
      const nextSamples = activitySamplesFromRecords(parsed);
      const observed = observeMaxHeartRate(nextSamples);
      const lthr = estimateActivityLthr(nextSamples);
      setSamples(nextSamples);
      setFilename(next.name);
      setMaxHr(observed?.bpm ?? null);
      setMaxHrInstantaneous(observed?.instantaneous ?? false);
      if (!nextSamples.some((sample) => sample.heartRate != null)) {
        setError(t("errors.heartRate"));
        return;
      }
      if (!lthr) {
        setError(t("errors.quality"));
        onResult({
          filename: next.name,
          lthr: null,
          rawMean: null,
          maxHr: observed?.bpm ?? null,
          maxHrInstantaneous: observed?.instantaneous ?? false,
          windowStartSec: null,
          windowEndSec: null,
          explicit: false,
        });
        return;
      }
      setAutoStart(lthr.windowStartSec);
      setStart(formatMinutes(lthr.windowStartSec));
      publish(
        nextSamples,
        next.name,
        lthr.windowStartSec,
        false,
        observed?.bpm ?? null,
        observed?.instantaneous ?? false,
      );
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

  function applyStart(value: string, explicit: boolean) {
    setStart(value);
    setError("");
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes < 0) {
      setError(t("errors.quality"));
      return;
    }
    publish(
      samples,
      filename,
      minutes * 60,
      explicit,
      maxHr,
      maxHrInstantaneous,
    );
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
        trackingTool="heart_rate_zones_calculator"
      />
      {busy ? (
        <p role="status" className={styles.fileHint}>
          <Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden />
          {t("reading")}
        </p>
      ) : null}
      {samples.length > 0 ? (
        <>
          <p className={styles.fileHint}>
            {t("duration", { minutes: (duration / 60).toFixed(1) })}
          </p>
          <div className={styles.field}>
            <Label htmlFor="hr-file-start">{t("start")}</Label>
            <Input
              id="hr-file-start"
              inputMode="decimal"
              value={start}
              onChange={(event) => applyStart(event.target.value, true)}
            />
          </div>
          <p className={styles.fileHint}>{t("windowHelp")}</p>
          {autoStart != null ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => applyStart(formatMinutes(autoStart), false)}
            >
              {t("auto")}
            </Button>
          ) : null}
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
