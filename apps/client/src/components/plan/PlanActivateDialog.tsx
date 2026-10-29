"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import CalendarSelect from "@/components/calendar-select";

interface PlanActivateDialogProps {
  open: boolean;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (startDate: string) => Promise<void> | void;
}

export function PlanActivateDialog({
  open,
  pending = false,
  onOpenChange,
  onConfirm,
}: PlanActivateDialogProps) {
  const t = useTranslations("PlanActivationDialog");
  const [startDate, setStartDate] = React.useState<Date | undefined>(undefined);

  const today = React.useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);
  const maxSelectableDate = React.useMemo(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 2);
    date.setHours(23, 59, 59, 999);
    return date;
  }, []);

  React.useEffect(() => {
    if (open) {
      setStartDate(today);
    }
  }, [open, today]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[420px]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <CalendarSelect
          date={startDate}
          onSelect={setStartDate}
          fromDate={today}
          toDate={maxSelectableDate}
          fromYear={today.getFullYear()}
          toYear={maxSelectableDate.getFullYear()}
          disabled={{ before: today }}
        />
        <DialogFooter>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            disabled={pending || !startDate}
            onClick={async () => {
              if (!startDate) return;
              const year = startDate.getFullYear();
              const month = String(startDate.getMonth() + 1).padStart(2, "0");
              const day = String(startDate.getDate()).padStart(2, "0");
              const start = `${year}-${month}-${day}`;
              await onConfirm(start);
            }}
          >
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
