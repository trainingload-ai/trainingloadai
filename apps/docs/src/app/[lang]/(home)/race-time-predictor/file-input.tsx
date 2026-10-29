"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { ToolFileDropzone } from "@/components/ToolClientControls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  bestRaceWindow,
  listRaceWindows,
  raceWindowBetween,
  type RaceActivityWindow,
} from "@/lib/race-time-predictor";
import type { ThresholdRecord } from "@/lib/threshold-records";
import styles from "./race-time-predictor.module.css";

export function RaceFileInput({
  onResult,
  onReset,
}: {
  onResult: (result: { filename: string; window: RaceActivityWindow }) => void;
  onReset: () => void;
}) {
  const t = useTranslations("raceTimePredictor.client.file");
  const [file, setFile] = useState<File | null>(null);
  const [records, setRecords] = useState<ThresholdRecord[]>([]);
  const [windows, setWindows] = useState<RaceActivityWindow[]>([]);
  const [selected, setSelected] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);

  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );

  function applyWindow(nextFile: File, window: RaceActivityWindow) {
    setSelected(window.key);
    setStart((window.startSeconds / 60).toFixed(2));
    setEnd((window.endSeconds / 60).toFixed(2));
    onResult({ filename: nextFile.name, window });
  }

  async function selectFile(next: File | null) {
    const id = ++request.current;
    onReset();
    setFile(next);
    setRecords([]);
    setWindows([]);
    setSelected("");
    setStart("");
    setEnd("");
    setError("");
    setBusy(Boolean(next));
    if (!next) return;
    try {
      const { readThresholdFile } = await import("@/lib/threshold-file");
      const parsed = await readThresholdFile(next);
      if (id !== request.current) return;
      const found = listRaceWindows(parsed);
      const best = bestRaceWindow(parsed);
      setRecords(parsed);
      setWindows(found);
      if (!best) {
        setError(t("errors.window"));
        return;
      }
      applyWindow(next, best);
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

  function choose(window: RaceActivityWindow) {
    if (!file) return;
    setError("");
    applyWindow(file, window);
  }

  function useManualWindow() {
    if (!file) return;
    const window = raceWindowBetween(
      records,
      Number(start) * 60,
      Number(end) * 60,
    );
    if (!window) {
      setError(t("errors.range"));
      onReset();
      return;
    }
    setError("");
    setSelected("manual");
    onResult({ filename: file.name, window });
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
        trackingTool="race_time_predictor"
      />
      {busy ? (
        <p role="status" className={styles.fileHint}>
          <Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden />
          {t("reading")}
        </p>
      ) : null}
      {windows.length > 0 ? (
        <fieldset className={styles.field}>
          <legend className={styles.fieldLabel}>{t("window")}</legend>
          <div className={styles.choiceRow}>
            {windows.map((window) => (
              <button
                key={`${window.key}-${window.startSeconds}`}
                type="button"
                className={styles.choice}
                aria-pressed={selected === window.key}
                onClick={() => choose(window)}
              >
                {t(`windows.${window.key}`)}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      {records.length > 0 ? (
        <>
          <div className={styles.timeGrid}>
            <div className={styles.field}>
              <Label htmlFor="race-file-start">{t("start")}</Label>
              <Input
                id="race-file-start"
                inputMode="decimal"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </div>
            <div className={styles.field}>
              <Label htmlFor="race-file-end">{t("end")}</Label>
              <Input
                id="race-file-end"
                inputMode="decimal"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </div>
          </div>
          <Button type="button" className={styles.primaryAction} onClick={useManualWindow}>
            {t("useWindow")}
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
