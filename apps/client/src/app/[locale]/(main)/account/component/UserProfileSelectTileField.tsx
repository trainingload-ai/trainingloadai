"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { settingsDialogDesktopClassName } from "@/components/ui/dialog-sizes";
import {
  AdaptiveDialog,
  AdaptiveDialogClose,
  AdaptiveDialogContent,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogTrigger,
  adaptiveDialogFooterActionButtonClassName,
  adaptiveDialogFooterActionsClassName,
} from "@/components/ui/adaptive-dialog";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check } from "lucide-react";
import { MetricTileButton } from "./MetricTileButton";

export function UserProfileSelectTileField<T extends string>({
  currentValue,
  description,
  headerAccessory,
  content,
  onSave,
  options,
  saveLabel,
  cancelLabel,
  title,
}: {
  cancelLabel: string;
  currentValue: T;
  description?: string;
  headerAccessory?: ReactNode | ((draftValue: T) => ReactNode);
  content?: ReactNode | ((draftValue: T) => ReactNode);
  onSave: (value: T) => void;
  options: readonly { label: string; value: T }[];
  saveLabel: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<T>(currentValue);

  useEffect(() => {
    if (open) setDraft(currentValue);
  }, [currentValue, open]);

  const valueLabel = useMemo(() => {
    return (
      options.find((option) => option.value === currentValue)?.label ??
      currentValue
    );
  }, [currentValue, options]);

  return (
    <AdaptiveDialog open={open} onOpenChange={setOpen}>
      <AdaptiveDialogTrigger asChild>
        <MetricTileButton title={title} value={valueLabel} />
      </AdaptiveDialogTrigger>
      <AdaptiveDialogContent desktopClassName={settingsDialogDesktopClassName}>
        <AdaptiveDialogHeader>
          <div className="flex items-center gap-2">
            <AdaptiveDialogTitle className="text-base font-medium">
              {title}
            </AdaptiveDialogTitle>
            {typeof headerAccessory === "function"
              ? headerAccessory(draft)
              : headerAccessory}
          </div>
          {description ? (
            <div className="text-sm text-muted-foreground">{description}</div>
          ) : null}
        </AdaptiveDialogHeader>
        <div className="space-y-4 px-4 md:px-0">
          <div className="rounded-md border bg-muted/25 p-2">
            <Command className="h-auto">
              <CommandList>
                <CommandGroup>
                  {options.map((option) => {
                    const selected = draft === option.value;
                    return (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        className="rounded-sm data-[selected=true]:bg-neutral-200 dark:data-[selected=true]:bg-muted"
                        onSelect={() => setDraft(option.value)}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selected ? "opacity-100" : "opacity-0",
                          )}
                        />
                        {option.label}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
          {open
            ? typeof content === "function"
              ? content(draft)
              : content
            : null}
        </div>
        <AdaptiveDialogFooter
          className={cn("mt-4", adaptiveDialogFooterActionsClassName)}
        >
          <AdaptiveDialogClose asChild>
            <Button
              variant="outline"
              size="dialog-action"
              className={adaptiveDialogFooterActionButtonClassName}
            >
              {cancelLabel}
            </Button>
          </AdaptiveDialogClose>
          <Button
            type="button"
            size="dialog-action"
            className={adaptiveDialogFooterActionButtonClassName}
            onClick={() => {
              if (draft !== currentValue) onSave(draft);
              setOpen(false);
            }}
          >
            {saveLabel}
          </Button>
        </AdaptiveDialogFooter>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
