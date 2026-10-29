"use client";

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
import {
  normalizeLoadSources,
  type LoadSource,
} from "./user-profile-sport-fields-model";

export function UserProfileLoadSourcesField({
  cancelLabel,
  description,
  onSave,
  options,
  placeholder,
  saveLabel,
  title,
  value,
}: {
  cancelLabel: string;
  description: string;
  onSave: (value: LoadSource[]) => void;
  options: readonly { label: string; value: LoadSource }[];
  placeholder: string;
  saveLabel: string;
  title: string;
  value: LoadSource[] | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LoadSource[]>(value ?? []);

  const current = useMemo(() => normalizeLoadSources(value ?? []), [value]);

  useEffect(() => {
    if (open) setDraft(current);
  }, [current, open]);

  const selectedText =
    current.length === 0
      ? placeholder
      : current
          .map((selectedValue) => {
            return (
              options.find((option) => option.value === selectedValue)?.label ??
              selectedValue
            );
          })
          .join(" < ");

  return (
    <AdaptiveDialog open={open} onOpenChange={setOpen}>
      <AdaptiveDialogTrigger asChild>
        <MetricTileButton
          title={title}
          value={current.length === 0 ? "-" : selectedText}
          mutedValue={current.length === 0}
        />
      </AdaptiveDialogTrigger>
      <AdaptiveDialogContent desktopClassName={settingsDialogDesktopClassName}>
        <AdaptiveDialogHeader>
          <AdaptiveDialogTitle className="text-base font-medium">
            {title}
          </AdaptiveDialogTitle>
          <div className="text-sm text-muted-foreground">{description}</div>
        </AdaptiveDialogHeader>
        <div className="rounded-md border bg-muted/25 p-2">
          <Command>
            <CommandList>
              <CommandGroup>
                {options.map((option) => {
                  const orderIndex = draft.indexOf(option.value);
                  const selected = orderIndex >= 0;
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      className="rounded-sm data-[selected=true]:bg-neutral-200 dark:data-[selected=true]:bg-muted"
                      onSelect={() => {
                        setDraft((previous) => {
                          const existingIndex = previous.indexOf(option.value);
                          if (existingIndex >= 0) {
                            return previous.filter(
                              (item) => item !== option.value,
                            );
                          }
                          return [...previous, option.value];
                        });
                      }}
                    >
                      <span
                        className={cn(
                          "mr-2 inline-flex h-6 w-6 items-center justify-center rounded-md border text-mobile-caption pc:text-xs tabular-nums",
                          selected ? "opacity-100" : "opacity-0",
                        )}
                      >
                        {orderIndex + 1}
                      </span>
                      <span className="flex-1 truncate">{option.label}</span>
                      <Check
                        className={cn(
                          "ml-2 h-4 w-4",
                          selected ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
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
              const next = normalizeLoadSources(draft);
              if (next.join(",") !== current.join(",")) onSave(next);
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
