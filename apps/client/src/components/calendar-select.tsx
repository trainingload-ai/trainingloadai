"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
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
import { Matcher } from "react-day-picker";

export function CalendarSelect({
  date,
  dateLabel,
  onSelect,
  placeholder = "Select Date",
  title,
  id,
  className,
  disabled,
  fromDate,
  toDate,
  fromYear,
  toYear,
  size = "sm",
}: {
  date?: Date;
  dateLabel?: string;
  onSelect?: (date?: Date) => void;
  placeholder?: string;
  title?: string;
  id?: string;
  className?: string;
  disabled?: Matcher;
  fromDate?: Date;
  toDate?: Date;
  fromYear?: number;
  toYear?: number;
  size?: ButtonProps["size"];
}) {
  const [open, setOpen] = React.useState(false);
  const isMobile = useIsMobile();

  const trigger = (
    <Button
      id={id}
      variant="outline"
      size={size}
      className={
        "w-full max-w-[420px] justify-between font-normal" +
        (className ? ` ${className}` : "")
      }
    >
      {date ? (dateLabel ?? date.toLocaleDateString()) : placeholder}
      <ChevronDownIcon />
    </Button>
  );

  const calendar = (
    <Calendar
      mode="single"
      selected={date}
      className={isMobile ? "w-full" : "w-[300px] "}
      captionLayout="dropdown"
      fromDate={fromDate}
      toDate={toDate}
      fromYear={fromYear}
      toYear={toYear}
      disabled={disabled}
      onSelect={(d) => {
        onSelect?.(d);
        setOpen(false);
      }}
      initialFocus
    />
  );

  if (isMobile) {
    return (
      <AdaptiveDialog open={open} onOpenChange={setOpen}>
        <AdaptiveDialogTrigger asChild>{trigger}</AdaptiveDialogTrigger>
        <AdaptiveDialogContent mobileClassName="p-0">
          <AdaptiveDialogHeader className="px-4 pt-4">
            <AdaptiveDialogTitle className="text-base font-medium">
              {title ?? placeholder}
            </AdaptiveDialogTitle>
          </AdaptiveDialogHeader>
          <div className="px-2 pb-4">{calendar}</div>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className=" w-full max-w-[420px] overflow-hidden p-0"
        align="start"
      >
        {calendar}
      </PopoverContent>
    </Popover>
  );
}

export default CalendarSelect;
