"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  BEST_INTERVAL_COLUMNS,
  type BestIntervalColumn,
} from "@/lib/activity-best-interval-columns";

export function BestIntervalColumnsDialog({
  columns,
  defaults,
  label,
  onSave,
  onClose,
}: {
  columns: BestIntervalColumn[];
  defaults: BestIntervalColumn[];
  label: (column: BestIntervalColumn) => string;
  onSave: (columns: BestIntervalColumn[]) => void;
  onClose: () => void;
}) {
  const t = useTranslations("ActivityDetail.bestIntervals");
  const id = useId();
  const [draft, setDraft] = useState(columns);
  const ordered = [
    ...draft,
    ...BEST_INTERVAL_COLUMNS.filter((id) => !draft.includes(id)),
  ];
  const move = (id: BestIntervalColumn, direction: number) => {
    const next = [...draft];
    const index = next.indexOf(id),
      target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setDraft(next);
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-w-md gap-0 p-0"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
      >
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle id={`${id}-title`}>{t("editColumns")}</DialogTitle>
          <DialogDescription id={`${id}-description`}>
            {t("columnsDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] overflow-y-auto px-3 py-2">
          {ordered.map((id) => {
            const selected = draft.includes(id),
              index = draft.indexOf(id);
            return (
              <div
                key={id}
                className="flex min-h-10 items-center justify-between gap-3 rounded-control px-2 hover:bg-muted/40"
              >
                <label className="flex flex-1 cursor-pointer items-center gap-3 py-2 text-sm">
                  <Checkbox
                    checked={selected}
                    disabled={selected && draft.length === 1}
                    onCheckedChange={(checked) =>
                      setDraft(
                        checked
                          ? [...draft, id]
                          : draft.filter((value) => value !== id),
                      )
                    }
                  />
                  {label(id)}
                </label>
                {selected ? (
                  <div className="flex gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      disabled={index === 0}
                      aria-label={t("moveColumnUp", { column: label(id) })}
                      onClick={() => move(id, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      disabled={index === draft.length - 1}
                      aria-label={t("moveColumnDown", { column: label(id) })}
                      onClick={() => move(id, 1)}
                    >
                      <ArrowDown />
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <DialogFooter className="flex-row items-center border-t border-border/60 px-5 py-3">
          <Button
            variant="ghost"
            className="mr-auto"
            onClick={() => setDraft([...defaults])}
          >
            {t("restoreColumns")}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t("cancelColumns")}
          </Button>
          <Button
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            {t("saveColumns")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
