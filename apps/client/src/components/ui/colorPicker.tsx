"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogTrigger,
} from "@/components/ui/adaptive-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTranslations } from "next-intl";
import { Paintbrush } from "lucide-react";
import { useState } from "react";

export function ColorPicker({
  value,
  onChange,
  className,
}: {
  value?: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("ColorPicker");

  // Standard training zone colors + common colors
  const colors = [
    "#808080", // Gray
    "#3b82f6", // Blue
    "#22c55e", // Green
    "#eab308", // Yellow
    "#f97316", // Orange
    "#ef4444", // Red
    "#a855f7", // Purple
    "#ec4899", // Pink
    "#14b8a6", // Teal
    "#000000", // Black
  ];

  const isMobile = useIsMobile();

  const trigger = (
    <Button
      variant="ghost"
      size="icon-xs"
      className={cn("rounded-full p-1", className)}
    >
      <div
        className="h-full w-full rounded-full border border-border"
        style={{ backgroundColor: value }}
      >
        {!value && (
          <div className="flex h-full items-center justify-center">
            <Paintbrush className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>
      <span className="sr-only">{t("srOnly")}</span>
    </Button>
  );

  const content = (
    <div className="space-y-3">
      <div className="space-y-1">
        <h4 className="font-medium leading-none text-sm">
          {t("paletteTitle")}
        </h4>
        <p className="text-mobile-caption pc:text-xs text-muted-foreground">
          {t("paletteDescription")}
        </p>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {colors.map((color) => (
          <button
            key={color}
            className="h-8 w-8 rounded-full border border-border cursor-pointer hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            style={{ backgroundColor: color }}
            onClick={() => {
              onChange(color);
              setOpen(false);
            }}
          >
            <span className="sr-only">{color}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div className="text-mobile-caption pc:text-xs text-muted-foreground w-12">
          {t("hex")}
        </div>
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-mobile-caption pc:text-xs"
          placeholder="#000000"
        />
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <AdaptiveDialog open={open} onOpenChange={setOpen}>
        <AdaptiveDialogTrigger asChild>{trigger}</AdaptiveDialogTrigger>
        <AdaptiveDialogContent mobileClassName="p-0">
          <AdaptiveDialogHeader className="px-4 pt-4">
            <AdaptiveDialogTitle className="text-base font-medium">
              {t("title")}
            </AdaptiveDialogTitle>
          </AdaptiveDialogHeader>
          <div className="p-4 pb-10">{content}</div>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-64 p-3">{content}</PopoverContent>
    </Popover>
  );
}
