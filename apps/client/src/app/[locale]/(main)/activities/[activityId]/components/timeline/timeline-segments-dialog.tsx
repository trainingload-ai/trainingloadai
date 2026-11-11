"use client";
import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { GitMerge, Scissors, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatSecondsToTime } from "@/utils/timeFormatter";
import {
  validTimelineSegments,
  type TimelineSegment,
} from "@shared/activity-timeline";
import { ApiFetchError } from "@/lib/api-error";

export function segmentTimeText(seconds: number) {
  const rounded = Math.round(seconds * 1000);
  const whole = Math.floor(rounded / 1000);
  const fraction = rounded % 1000;
  return (
    formatSecondsToTime(whole) +
    (fraction ? `.${String(fraction).padStart(3, "0").replace(/0+$/, "")}` : "")
  );
}
export function parseSegmentTime(input: string) {
  if (!/^\d+(?::[0-5]?\d){0,2}(?:\.\d{1,3})?$/.test(input.trim())) return NaN;
  return input
    .trim()
    .split(":")
    .reduce((seconds, part) => seconds * 60 + Number(part), 0);
}
type Draft = { id: string; name: string; start: string; end: string };
const draftOf = (segments: TimelineSegment[]): Draft[] =>
  segments.map((segment) => ({
    ...segment,
    start: segmentTimeText(segment.start),
    end: segmentTimeText(segment.end),
  }));

export function TimelineSegmentsDialog({
  segments,
  native,
  selectedId,
  duration,
  saving,
  onSave,
  onClose,
}: {
  segments: TimelineSegment[];
  native: TimelineSegment[];
  selectedId: string | null;
  duration: number;
  saving: boolean;
  onSave: (segments: TimelineSegment[]) => Promise<unknown>;
  onClose: () => void;
}) {
  const t = useTranslations("ActivityTimeline");
  const id = useId();
  const [draft, setDraft] = useState(() => draftOf(segments));
  const [currentId, setCurrentId] = useState(
    selectedId ?? segments[0]?.id ?? "",
  );
  const [error, setError] = useState("");
  const parsed = draft
    .map((segment) => ({
      ...segment,
      start: parseSegmentTime(segment.start),
      end: parseSegmentTime(segment.end),
    }))
    .sort((a, b) => a.start - b.start);
  const valid = validTimelineSegments(parsed, duration);
  const selected = draft.find((segment) => segment.id === currentId);
  const index = parsed.findIndex((segment) => segment.id === currentId);
  const segment = parsed[index];
  const next = parsed[index + 1];
  const update = (change: Partial<Draft>) => {
    setDraft((value) =>
      value.map((row) => (row.id === currentId ? { ...row, ...change } : row)),
    );
    setError("");
  };
  let gap: [number, number] | null = null;
  let end = 0;
  if (valid) {
    for (const row of parsed) {
      if (row.start - end >= 0.1) {
        gap = [end, row.start];
        break;
      }
      end = row.end;
    }
    if (!gap && duration - end >= 0.1) gap = [end, duration];
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent aria-labelledby={`${id}-title`}>
        <DialogHeader>
          <DialogTitle id={`${id}-title`}>{t("editSegments")}</DialogTitle>
          <DialogDescription>{t("editSegmentsDescription")}</DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor={`${id}-selected`}>{t("segment")}</FieldLabel>
            <div className="flex items-center gap-2">
              <Select
                value={currentId}
                onValueChange={setCurrentId}
                disabled={saving || !draft.length}
              >
                <SelectTrigger id={`${id}-selected`}>
                  <SelectValue placeholder={t("noSegments")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {draft.map((row, index) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name || t("lap", { number: index + 1 })} ·{" "}
                        {row.start}–{row.end}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("addSegment")}
                disabled={saving || !gap || draft.length >= 512}
                onClick={() => {
                  if (!gap) return;
                  const row = {
                    id: crypto.randomUUID(),
                    name: "",
                    start: gap[0],
                    end: gap[1],
                  };
                  setDraft(
                    draftOf([...parsed, row].sort((a, b) => a.start - b.start)),
                  );
                  setCurrentId(row.id);
                }}
              >
                <Plus />
              </Button>
            </div>
          </Field>
          {selected ? (
            <>
              <Field>
                <FieldLabel htmlFor={`${id}-name`}>
                  {t("segmentName")}
                </FieldLabel>
                <Input
                  id={`${id}-name`}
                  value={selected.name}
                  placeholder={t("lap", { number: index + 1 })}
                  maxLength={80}
                  disabled={saving}
                  onChange={(event) => update({ name: event.target.value })}
                />
              </Field>
              <FieldGroup className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor={`${id}-start`}>
                    {t("segmentStart")}
                  </FieldLabel>
                  <Input
                    id={`${id}-start`}
                    value={selected.start}
                    disabled={saving}
                    onChange={(event) => update({ start: event.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-end`}>
                    {t("segmentEnd")}
                  </FieldLabel>
                  <Input
                    id={`${id}-end`}
                    value={selected.end}
                    disabled={saving}
                    onChange={(event) => update({ end: event.target.value })}
                  />
                </Field>
              </FieldGroup>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={
                    saving ||
                    !valid ||
                    !segment ||
                    segment.end - segment.start < 1 ||
                    draft.length >= 512
                  }
                  onClick={() => {
                    const middle =
                      Math.round((segment.start + segment.end) * 500) / 1000;
                    const added = {
                      id: crypto.randomUUID(),
                      name: "",
                      start: middle,
                      end: segment.end,
                    };
                    setDraft(
                      draftOf(
                        parsed.flatMap((row) =>
                          row.id === segment.id
                            ? [{ ...row, end: middle }, added]
                            : [row],
                        ),
                      ),
                    );
                    setCurrentId(added.id);
                  }}
                >
                  <Scissors />
                  {t("splitSegment")}
                </Button>
                <Button
                  variant="outline"
                  disabled={saving || !valid || !next}
                  onClick={() =>
                    setDraft(
                      draftOf(
                        parsed.flatMap((row) =>
                          row.id === next.id
                            ? []
                            : [
                                {
                                  ...row,
                                  ...(row.id === segment.id
                                    ? { end: next.end }
                                    : {}),
                                },
                              ],
                        ),
                      ),
                    )
                  }
                >
                  <GitMerge />
                  {t("mergeNextSegment")}
                </Button>
                <Button
                  variant="ghost"
                  disabled={saving}
                  onClick={() => {
                    const rows = draft.filter((row) => row.id !== currentId);
                    setDraft(rows);
                    setCurrentId(rows[0]?.id ?? "");
                  }}
                >
                  <Trash2 />
                  {t("removeSegment")}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("noSegments")}</p>
          )}
        </FieldGroup>
        {!valid || error ? (
          <p className="text-sm text-destructive" role="alert">
            {error || t("invalidSegments")}
          </p>
        ) : null}
        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            disabled={saving}
            onClick={() => {
              setDraft(draftOf(native));
              setCurrentId(native[0]?.id ?? "");
              setError("");
            }}
          >
            {t("restoreLaps")}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" disabled={saving} onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              disabled={saving || !valid}
              onClick={async () => {
                setError("");
                try {
                  await onSave(parsed);
                  onClose();
                } catch (error) {
                  setError(
                    error instanceof ApiFetchError && error.status === 409
                      ? t("segmentsConflict")
                      : t("segmentsSaveError"),
                  );
                }
              }}
            >
              {saving ? t("saving") : t("saveSegments")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
