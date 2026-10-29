"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export function WorkoutActionConfirm({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel,
  confirmLabel,
  pending = false,
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  pending?: boolean;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent className="max-w-[18.5rem] gap-0 overflow-hidden rounded-control-lg border-border/60 bg-background/95 p-0 shadow-2xl backdrop-blur-xl pc:max-w-sm pc:gap-4 pc:rounded-overlay pc:p-6">
        <AlertDialogHeader className="gap-1.5 px-5 pb-4 pt-5 text-center pc:px-0 pc:pb-0 pc:pt-0 pc:text-left">
          <AlertDialogTitle className="text-[17px] leading-6 pc:text-lg">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="mx-auto max-w-[15rem] text-[13px] leading-[18px] pc:mx-0 pc:max-w-none pc:text-sm pc:leading-5">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="grid grid-cols-2 gap-0 border-t border-border/70 pc:flex pc:border-0">
          <AlertDialogCancel
            disabled={pending}
            className="mt-0 h-11 rounded-none border-0 border-r border-border/70 bg-transparent px-3 text-[15px] font-medium shadow-none hover:bg-muted/70 pc:h-9 pc:rounded-md pc:border pc:bg-background pc:px-4 pc:text-sm pc:shadow-xs"
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              void onConfirm();
            }}
            className={cn(
              "h-11 rounded-none border-0 bg-transparent px-3 text-[15px] font-semibold text-sky-600 shadow-none hover:bg-muted/70 hover:text-sky-600 dark:text-sky-400 dark:hover:text-sky-400 pc:h-9 pc:rounded-md pc:bg-primary pc:px-4 pc:text-sm pc:text-primary-foreground pc:shadow-xs pc:hover:bg-primary/90 pc:hover:text-primary-foreground",
              destructive &&
                "text-destructive hover:text-destructive dark:text-red-400 dark:hover:text-red-400 pc:bg-destructive pc:text-destructive-foreground pc:hover:bg-destructive/90 pc:hover:text-destructive-foreground",
            )}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
