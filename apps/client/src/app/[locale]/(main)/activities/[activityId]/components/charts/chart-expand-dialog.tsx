"use client";

import React, { useEffect, useState } from "react";
import { Maximize2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ChartExpandDialogProps {
  title: string;
  children?: React.ReactNode;
  triggerLabel?: string;
  contentClassName?: string;
}

const ChartExpandDialog: React.FC<ChartExpandDialogProps> = ({
  title,
  children,
  triggerLabel,
  contentClassName,
}) => {
  const [open, setOpen] = useState(false);
  const effectiveTriggerLabel = triggerLabel ?? title;

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    const orientation = window.screen?.orientation as
      | {
          lock?: (orientation: "landscape") => Promise<void>;
          unlock?: () => void;
        }
      | undefined;

    if (!orientation?.lock) return;

    orientation.lock("landscape").catch(() => {
      // Best-effort only. Some browsers require fullscreen or block it entirely.
    });

    return () => {
      orientation.unlock?.();
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="icon-responsive"
        aria-label={effectiveTriggerLabel}
        title={effectiveTriggerLabel}
        className="touch-manipulation border-0 bg-muted/70 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring pc:bg-transparent pc:hover:bg-muted [&_svg]:size-3.5"
        onClick={() => setOpen(true)}
      >
        <Maximize2 />
      </Button>
      <DialogContent
        className={cn(
          "flex h-[100dvh] w-screen max-w-none flex-col gap-3 rounded-none border-0 p-3 sm:h-[min(92vh,900px)] sm:w-[min(96vw,1200px)] sm:max-w-none sm:rounded-xl sm:border sm:p-6",
          contentClassName,
        )}
      >
        <DialogHeader className="pr-8">
          <DialogTitle className="text-sm md:text-base">{title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1">{open ? children : null}</div>
      </DialogContent>
    </Dialog>
  );
};

export default ChartExpandDialog;
