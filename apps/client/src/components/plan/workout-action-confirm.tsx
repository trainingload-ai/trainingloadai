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
import { buttonVariants } from "@/components/ui/button";

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
  onCloseAutoFocus,
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
  onCloseAutoFocus?: (event: Event) => void;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={onCloseAutoFocus}
        className="max-w-[18.5rem] gap-0 overflow-hidden rounded-control-lg border-border/60 bg-background/95 p-0 shadow-2xl backdrop-blur-xl pc:max-w-sm pc:gap-4 pc:rounded-overlay pc:p-6"
      >
        <AlertDialogHeader className="gap-1.5 px-5 pb-4 pt-5 text-center pc:px-0 pc:pb-0 pc:pt-0 pc:text-left">
          <AlertDialogTitle className="text-[17px] leading-6 pc:text-lg">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="mx-auto max-w-[15rem] text-[13px] leading-[18px] pc:mx-0 pc:max-w-none pc:text-sm pc:leading-5">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="px-5 pb-5 pc:p-0">
          <AlertDialogCancel
            disabled={pending}
            className={buttonVariants({
              variant: "outline",
              size: "touch-sm",
              className: "pc:rounded-md",
            })}
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              void onConfirm();
            }}
            className={buttonVariants({
              variant: destructive ? "destructive" : "default",
              size: "touch-sm",
              className: "pc:rounded-md",
            })}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
