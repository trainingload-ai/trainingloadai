"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { ToolFileDropzone } from "@/components/ToolClientControls";
import { Button } from "@/components/ui/button";
import { observeMaxHeartRate } from "@/lib/max-heart-rate";
import styles from "./max-heart-rate-calculator.module.css";

export function MaxHrFileInput({
  generation,
  onPeak,
  onClear,
}: {
  generation: number;
  onPeak: (peak: number, filename: string) => void;
  onClear: () => void;
}) {
  const t = useTranslations("maxHeartRateCalculator.page.file");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [empty, setEmpty] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    request.current += 1;
  }, [generation]);

  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );

  async function selectFile(next: File | null) {
    const id = ++request.current;
    onClear();
    setFile(next);
    setError("");
    setEmpty(false);
    setBusy(Boolean(next));
    if (!next) return;
    try {
      const { readThresholdFile } = await import("@/lib/threshold-file");
      const records = await readThresholdFile(next);
      if (id !== request.current) return;
      const peak = observeMaxHeartRate(records);
      if (peak == null) {
        setEmpty(true);
        return;
      }
      onPeak(peak, next.name);
    } catch (err) {
      if (id !== request.current) return;
      const code =
        err instanceof Error &&
        ["size", "format", "timestamps"].includes(err.message)
          ? err.message
          : "format";
      setError(t(`errors.${code}`));
    } finally {
      if (id === request.current) setBusy(false);
    }
  }

  return (
    <div className={styles.filePanel}>
      <ToolFileDropzone
        file={file}
        onFileChange={(next) => {
          void selectFile(next);
        }}
        accept=".fit,.gpx,.tcx"
        pickStrong={t("pick")}
        pickRest={t("drop")}
        supported={t("formats")}
        dropzoneAria={t("pick")}
        removeFileAria={t("remove")}
        trackingTool="max_heart_rate_calculator"
      />
      {busy ? (
        <p role="status" className={styles.hint}>
          <Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden />
          {t("reading")}
        </p>
      ) : null}
      {file ? (
        <p className={styles.hint}>{t("fromFile", { filename: file.name })}</p>
      ) : null}
      {empty ? (
        <p role="status" className={styles.hint}>
          {t("noPeak")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function UseObservedPeakButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  const t = useTranslations("maxHeartRateCalculator.page.scorecard");
  return (
    <Button
      type="button"
      variant="outline"
      className={styles.usePeak}
      disabled={disabled}
      onClick={onClick}
    >
      {t("useObserved")}
    </Button>
  );
}
