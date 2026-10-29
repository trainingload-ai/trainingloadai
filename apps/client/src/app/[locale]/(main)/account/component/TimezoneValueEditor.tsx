"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogTrigger,
} from "@/components/ui/adaptive-dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatTimezoneOffset } from "./user-profile-metric-model";

type TimezoneValueEditorProps = {
  emptyLabel: string;
  isMobile: boolean;
  label: string;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (value: string) => void;
  onSelect: (value: string) => void;
  open: boolean;
  options: string[];
  placeholder: string;
  query: string;
  value: string;
};

function TimezoneCommandList({
  emptyLabel,
  onQueryChange,
  onSelect,
  options,
  placeholder,
  query,
  value,
}: Omit<
  TimezoneValueEditorProps,
  "isMobile" | "label" | "onOpenChange" | "open"
>) {
  return (
    <Command shouldFilter={false}>
      <CommandInput
        placeholder={placeholder}
        value={query}
        onValueChange={onQueryChange}
      />
      <CommandList
        onWheelCapture={(e) => {
          e.stopPropagation();
          e.currentTarget.scrollTop += e.deltaY;
        }}
      >
        <CommandEmpty>{emptyLabel}</CommandEmpty>
        <CommandGroup>
          {options.map((tz) => {
            const offset = formatTimezoneOffset(tz);
            return (
              <CommandItem
                key={tz}
                value={`${tz} ${offset}`}
                onSelect={() => onSelect(tz)}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === tz ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{tz}</span>
                <span className="ml-auto shrink-0 rounded-xs bg-muted px-1.5 py-0.5 text-mobile-caption pc:text-xs text-muted-foreground">
                  {offset}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

export function TimezoneValueEditor({
  emptyLabel,
  isMobile,
  label,
  onOpenChange,
  onQueryChange,
  onSelect,
  open,
  options,
  placeholder,
  query,
  value,
}: TimezoneValueEditorProps) {
  const trigger = (
    <Button
      variant="outline"
      role="combobox"
      aria-expanded={open}
      className="w-full justify-between"
    >
      <span className="min-w-0 truncate">
        {value ? `${value} · ${formatTimezoneOffset(value)}` : placeholder}
      </span>
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  );

  if (isMobile) {
    return (
      <AdaptiveDialog open={open} onOpenChange={onOpenChange}>
        <AdaptiveDialogTrigger asChild>{trigger}</AdaptiveDialogTrigger>
        <AdaptiveDialogContent mobileClassName="p-0">
          <AdaptiveDialogHeader className="px-4 pt-4">
            <AdaptiveDialogTitle className="text-base font-medium">
              {label}
            </AdaptiveDialogTitle>
          </AdaptiveDialogHeader>
          <div className="p-4 pt-0">
            <TimezoneCommandList
              emptyLabel={emptyLabel}
              onQueryChange={onQueryChange}
              onSelect={onSelect}
              options={options}
              placeholder={placeholder}
              query={query}
              value={value}
            />
          </div>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <TimezoneCommandList
          emptyLabel={emptyLabel}
          onQueryChange={onQueryChange}
          onSelect={onSelect}
          options={options}
          placeholder={placeholder}
          query={query}
          value={value}
        />
      </PopoverContent>
    </Popover>
  );
}
