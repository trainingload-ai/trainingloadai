"use client";

import { Bike, ChevronsUpDown, Clock3, Footprints, Waves } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CompetitionEvent } from "@/api/competition-events";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CompetitionTimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("CompetitionEvents");
  const [hour = "07", minute = "00"] = value ? value.split(":") : [];
  const minuteOptions = Array.from(
    new Set(
      [
        "00",
        "05",
        "10",
        "15",
        "20",
        "25",
        "30",
        "35",
        "40",
        "45",
        "50",
        "55",
        minute,
      ].filter(Boolean),
    ),
  ).sort();

  if (!value) {
    return (
      <div className="space-y-1.5">
        <span className="text-mobile-caption pc:text-xs font-medium">{t("form.startTime")}</span>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start font-normal text-muted-foreground"
          onClick={() => onChange("07:00")}
        >
          <Clock3 aria-hidden="true" className="mr-2 h-4 w-4" />
          {t("form.allDay")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-mobile-caption pc:text-xs font-medium">{t("form.startTime")}</span>
        <button
          type="button"
          className="text-mobile-caption pc:text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onChange("")}
        >
          {t("form.useAllDay")}
        </button>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Select
          value={hour}
          onValueChange={(next) => onChange(`${next}:${minute || "00"}`)}
        >
          <SelectTrigger aria-label={t("form.hour")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 24 }, (_, index) =>
              String(index).padStart(2, "0"),
            ).map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">:</span>
        <Select
          value={minute || "00"}
          onValueChange={(next) => onChange(`${hour || "07"}:${next}`)}
        >
          <SelectTrigger aria-label={t("form.minute")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {minuteOptions.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

const SPORTS: Array<{
  value: CompetitionEvent["sportType"];
  icon: typeof Footprints;
}> = [
  { value: "RUN", icon: Footprints },
  { value: "CYCLING", icon: Bike },
  { value: "SWIM", icon: Waves },
  { value: "UNKNOWN", icon: ChevronsUpDown },
];

export function CompetitionSportPicker({
  value,
  onChange,
}: {
  value: CompetitionEvent["sportType"];
  onChange: (value: CompetitionEvent["sportType"]) => void;
}) {
  const t = useTranslations("CompetitionEvents");
  return (
    <div className="space-y-1.5">
      <label htmlFor="competition-sport" className="text-mobile-caption pc:text-xs font-medium">
        {t("form.sport")}
      </label>
      <Select
        value={value}
        onValueChange={(next) =>
          onChange(next as CompetitionEvent["sportType"])
        }
      >
        <SelectTrigger id="competition-sport">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SPORTS.map(({ value: option, icon: Icon }) => (
            <SelectItem key={option} value={option}>
              <span className="flex items-center gap-2">
                <Icon aria-hidden="true" className="h-4 w-4" />
                {t(`sports.${option}`)}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
