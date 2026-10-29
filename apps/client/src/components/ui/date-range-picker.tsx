"use client";

import * as React from "react";
import { format } from "date-fns";
import { zhCN, enUS } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange, type OnSelectHandler } from "react-day-picker";
import { useLocale, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogTrigger,
} from "@/components/ui/adaptive-dialog";

interface DatePickerWithRangeProps {
  className?: string;
  date?: DateRange;
  size?: "default" | "xs" | "sm" | "lg" | "icon";
  onDateChange?: (date: DateRange | undefined) => void;
  trigger?: React.ReactNode;
  popoverModal?: boolean;
  startNewRangeOnOpen?: boolean;
  calendarProps?: Omit<
    React.ComponentProps<typeof Calendar>,
    "mode" | "selected" | "onSelect"
  >;
}

export function DatePickerWithRange({
  className,
  date,
  size,
  onDateChange,
  trigger,
  popoverModal = false,
  startNewRangeOnOpen = false,
  calendarProps,
}: DatePickerWithRangeProps) {
  const t = useTranslations("SharedUI");
  const locale = useLocale();
  const dateLocale = locale === "zh" ? zhCN : enUS;
  const dateFormat = locale === "zh" ? "yyyy/MM/dd" : "LLL dd, y";
  const isMobile = useIsMobile();

  const [selectedDate, setSelectedDate] = React.useState<DateRange | undefined>(
    date,
  );
  const [open, setOpen] = React.useState(false);
  const awaitingRangeEndRef = React.useRef(false);

  React.useEffect(() => {
    setSelectedDate(date);
  }, [date]);

  const handleSelect: OnSelectHandler<DateRange | undefined> = (range) => {
    if (startNewRangeOnOpen && awaitingRangeEndRef.current && range?.from) {
      const nextRange = { from: range.from, to: undefined };
      awaitingRangeEndRef.current = false;
      setSelectedDate(nextRange);
      onDateChange?.(nextRange);
      return;
    }
    setSelectedDate(range);
    onDateChange?.(range);
    if (range?.from && range?.to) setOpen(false);
  };

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (nextOpen && startNewRangeOnOpen) {
        awaitingRangeEndRef.current = true;
        setSelectedDate(undefined);
      } else if (!nextOpen) {
        awaitingRangeEndRef.current = false;
      }
      setOpen(nextOpen);
    },
    [startNewRangeOnOpen],
  );

  const triggerNode = trigger ? (
    trigger
  ) : (
    <Button
      id="date"
      type="button"
      size={size}
      variant={"outline"}
      className={cn(
        "w-full justify-start text-left font-normal",
        !date && "text-muted-foreground",
      )}
    >
      <CalendarIcon className="mr-2 h-4 w-4" />
      {date?.from ? (
        date.to ? (
          <>
            {format(date.from, dateFormat, { locale: dateLocale })} -{" "}
            {format(date.to, dateFormat, { locale: dateLocale })}
          </>
        ) : (
          format(date.from, dateFormat, { locale: dateLocale })
        )
      ) : (
        <span>{t("pickDate")}</span>
      )}
    </Button>
  );

  if (isMobile) {
    return (
      <div className={cn("grid gap-2", className)}>
        <AdaptiveDialog open={open} onOpenChange={handleOpenChange}>
          <AdaptiveDialogTrigger asChild>{triggerNode}</AdaptiveDialogTrigger>
          <AdaptiveDialogContent mobileClassName="p-0">
            <AdaptiveDialogHeader className="px-4 pt-4">
              <AdaptiveDialogTitle className="text-base font-medium">
                {t("pickDate")}
              </AdaptiveDialogTitle>
            </AdaptiveDialogHeader>
            <div className="px-2 pb-4">
              <Calendar
                {...calendarProps}
                mode="range"
                defaultMonth={date?.from}
                selected={selectedDate}
                onSelect={handleSelect}
                numberOfMonths={1}
                locale={dateLocale}
                className="w-full"
              />
            </div>
          </AdaptiveDialogContent>
        </AdaptiveDialog>
      </div>
    );
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover modal={popoverModal} open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>{triggerNode}</PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            {...calendarProps}
            mode="range"
            defaultMonth={date?.from}
            selected={selectedDate}
            onSelect={handleSelect}
            numberOfMonths={2}
            locale={dateLocale}
            className="w-[500px]"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
