"use client";

import React from "react";
import dayjs from "dayjs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocale, useTranslations } from "next-intl";

interface MonthYearPickerProps {
  value: Date;
  onChange: (date: Date) => void;
  fromYear?: number;
  toYear?: number;
}

const MonthYearPicker: React.FC<MonthYearPickerProps> = ({
  value,
  onChange,
  fromYear = 2000,
  toYear = dayjs().year() + 5,
}) => {
  const current = dayjs(value);
  const [year, setYear] = React.useState<number>(current.year());
  const locale = useLocale();
  const t = useTranslations("MonthYearPicker");

  const monthLabels = React.useMemo(() => {
    return Array.from({ length: 12 }, (_, i) =>
      new Intl.DateTimeFormat(locale, { month: "short" }).format(
        new Date(2000, i, 1)
      )
    );
  }, [locale]);

  const years = React.useMemo(() => {
    const ys: number[] = [];
    for (let y = fromYear; y <= toYear; y++) ys.push(y);
    return ys;
  }, [fromYear, toYear]);

  const handleSelectMonth = (monthIndex: number) => {
    onChange(new Date(year, monthIndex, 1));
  };

  return (
    <div className="w-[220px] p-3">
      <div className="flex items-center gap-2 mb-3">
        <Select
          value={String(year)}
          onValueChange={(val) => setYear(Number(val))}
        >
          <SelectTrigger size="sm" className="w-full" aria-label={t("selectYear")}>
            <SelectValue placeholder={t("selectYear")} />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {monthLabels.map((label, idx) => {
          const isActive = idx === current.month() && year === current.year();
          return (
            <Button
              key={label}
              size="sm"
              variant={isActive ? "default" : "ghost"}
              className="justify-center"
              onClick={() => handleSelectMonth(idx)}
            >
              {label}
            </Button>
          );
        })}
      </div>
    </div>
  );
};

export default MonthYearPicker;
