"use client";

import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type WeekdayOption = {
  value: number;
  label: string;
};

export function WeekdayMultiSelect({
  options,
  value,
  maxSelected,
  onValueChange,
  ariaLabel,
  selectionLabel,
  placeholder,
  separator = ", ",
}: {
  options: readonly WeekdayOption[];
  value: number[];
  maxSelected: number;
  onValueChange: (value: number[]) => void;
  ariaLabel: string;
  selectionLabel: (selected: number, required: number) => string;
  placeholder: string;
  separator?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = new Set(value);
  const selectedLabels = options
    .filter((option) => selected.has(option.value))
    .map((option) => option.label);

  const toggle = (nextValue: number) => {
    if (selected.has(nextValue)) {
      onValueChange(value.filter((item) => item !== nextValue));
      return;
    }
    if (value.length >= maxSelected) return;
    onValueChange([...value, nextValue].sort((a, b) => a - b));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className="w-full justify-between font-normal"
        >
          <span
            className={cn(
              "truncate",
              selectedLabels.length === 0 && "text-muted-foreground",
            )}
          >
            {selectedLabels.length > 0
              ? selectedLabels.join(separator)
              : placeholder}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-0"
      >
        <Command>
          <CommandList>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.has(option.value);
                const disabled = !isSelected && value.length >= maxSelected;
                return (
                  <CommandItem
                    key={option.value}
                    value={`${option.value}-${option.label}`}
                    disabled={disabled}
                    onSelect={() => toggle(option.value)}
                  >
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded-sm border",
                        isSelected
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-input",
                      )}
                    >
                      {isSelected ? (
                        <Check
                          aria-hidden="true"
                          className="size-3 text-white dark:text-zinc-950"
                        />
                      ) : null}
                    </span>
                    <span>{option.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          <div className="border-t px-3 py-2 text-xs text-muted-foreground">
            {selectionLabel(value.length, maxSelected)}
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
