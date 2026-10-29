"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, X } from "lucide-react";
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
import { calculateCss, formatPaceClock, type CssSwim } from "@/lib/css";
import type { SwimFileEffort } from "@/lib/css-file";
import styles from "./css-calculator.module.css";

type LoadedFile = { id: number; file: File; efforts: SwimFileEffort[] };

export function CssFileInput({
  onResult,
  onReset,
}: {
  onResult: (swims: [CssSwim, CssSwim]) => void;
  onReset: () => void;
}) {
  const t = useTranslations("cssCalculator.page.file");
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [selected, setSelected] = useState<[string, string]>(["", ""]);
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
  const options = files.flatMap((entry, fileIndex) =>
    entry.efforts.map((effort, i) => ({
      ...effort,
      key: `${entry.id}:${i}`,
      fileIndex: fileIndex + 1,
    })),
  );

  function resetSelection() {
    setSelected(["", ""]);
    setDone(false);
    setError("");
    onReset();
  }

  async function addFile(file: File | null) {
    if (!file || busy || files.length >= 2) return;
    const id = ++request.current;
    setBusy(true);
    resetSelection();
    try {
      const { readSwimFile } = await import("@/lib/css-file");
      const efforts = await readSwimFile(file);
      if (id === request.current)
        setFiles((current) => [...current, { id, file, efforts }]);
    } catch (cause) {
      if (id === request.current) {
        const code =
          cause instanceof Error &&
          ["size", "sport", "data"].includes(cause.message)
            ? cause.message
            : "format";
        setError(t(`errors.${code}`));
      }
    } finally {
      if (id === request.current) setBusy(false);
    }
  }

  function calculate() {
    const first = options.find((option) => option.key === selected[0]);
    const second = options.find((option) => option.key === selected[1]);
    if (!first || !second || first.key === second.key) return;
    if (!calculateCss(first, second, "meters")) {
      setError(t("errors.pair"));
      setDone(false);
      return;
    }
    setError("");
    onResult([
      { distance: first.distance, timeSec: first.timeSec },
      { distance: second.distance, timeSec: second.timeSec },
    ]);
    setDone(true);
  }

  return (
    <div className={styles.filePanel}>
      <p className={styles.fileHint}>{t("intro")}</p>
      {files.length < 2 && !busy ? (
        <ToolFileDropzone
          file={null}
          onFileChange={addFile}
          accept=".fit,.tcx,.gpx"
          pickStrong={t("pick")}
          pickRest={t("drop")}
          supported={t("formats")}
          dropzoneAria={t("pick")}
          trackingTool="css_calculator"
        />
      ) : null}
      {busy ? (
        <p role="status" className={styles.fileHint}>
          <Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden />
          {t("reading")}
        </p>
      ) : null}
      {files.map((entry, index) => (
        <div key={entry.id} className={styles.loadedFile}>
          <span title={entry.file.name}>
            {t("fileNumber", { index: index + 1 })} · {entry.file.name}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("remove", { name: entry.file.name })}
            onClick={() => {
              request.current++;
              setBusy(false);
              setFiles((current) =>
                current.filter((file) => file.id !== entry.id),
              );
              resetSelection();
            }}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      ))}
      {options.length ? (
        <>
          {[0, 1].map((index) => (
            <div key={index} className={styles.field}>
              <Label htmlFor={`css-file-${index}`}>
                {t("effort", { index: index + 1 })}
              </Label>
              <Select
                value={selected[index]}
                onValueChange={(value) => {
                  setSelected((current) =>
                    index === 0 ? [value, current[1]] : [current[0], value],
                  );
                  setDone(false);
                  setError("");
                  onReset();
                }}
              >
                <SelectTrigger
                  id={`css-file-${index}`}
                  className="w-full min-w-0"
                >
                  <SelectValue placeholder={t("choose")} />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]"
                >
                  {options.map((option) => (
                    <SelectItem
                      key={option.key}
                      value={option.key}
                      disabled={selected[1 - index] === option.key}
                    >
                      {files.length > 1
                        ? `${t("fileNumber", { index: option.fileIndex })} · `
                        : ""}
                      {t("option", {
                        index: option.index,
                        distance: Number(option.distance.toFixed(1)),
                        time: formatPaceClock(option.timeSec),
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <p className={styles.fileHint}>{t("timing")}</p>
          <Button
            type="button"
            className={styles.primaryAction}
            disabled={
              !selected[0] ||
              !selected[1] ||
              selected[0] === selected[1] ||
              busy
            }
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
