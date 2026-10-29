"use client";

import * as React from "react";
import { ButtonGroup } from "@/components/ui/button-group";
import { Button } from "@/components/ui/button";
import { Time } from "./types";
import dayjs from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear";
import isoWeek from "dayjs/plugin/isoWeek";
import { useTranslations, useLocale } from "next-intl";
import "dayjs/locale/zh-cn";

// 扩展 dayjs 插件
dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);

export function DateButtonGroupSelector({
  time,
  setTime,
  exclude = [],
}: {
  time: Time;
  setTime: (time: Time) => void;
  exclude?: string[];
}) {
  const t = useTranslations("dateSelector");
  const locale = useLocale();

  const handleSetDay = () => {
    setTime({
      mode: "day",
      day: dayjs().toISOString(),
    });
  };

  const handleSetWeek = () => {
    const dayjsLocale = locale === "zh" ? "zh-cn" : "en";
    setTime({
      mode: "week",
      week: dayjs().locale(dayjsLocale).startOf("week").toISOString(),
    });
  };

  const handleSetMonth = () => {
    setTime({
      mode: "month",
      month: dayjs().startOf("month").toISOString(),
    });
  };

  const handleSetYear = () => {
    setTime({
      mode: "year",
      year: dayjs().startOf("year").toISOString(),
    });
  };

  return (
    <ButtonGroup>
      {!exclude.includes("day") && (
        <Button
          variant={time.mode === "day" ? "default" : "outline"}
          size="sm"
          onClick={handleSetDay}
        >
          {t("day")}
        </Button>
      )}
      {!exclude.includes("week") && (
        <Button
          variant={time.mode === "week" ? "default" : "outline"}
          size="sm"
          onClick={handleSetWeek}
        >
          {t("week")}
        </Button>
      )}
      {!exclude.includes("month") && (
        <Button
          variant={time.mode === "month" ? "default" : "outline"}
          size="sm"
          onClick={handleSetMonth}
        >
          {t("month")}
        </Button>
      )}
      {!exclude.includes("year") && (
        <Button
          variant={time.mode === "year" ? "default" : "outline"}
          size="sm"
          onClick={handleSetYear}
        >
          {t("year")}
        </Button>
      )}
    </ButtonGroup>
  );
}
