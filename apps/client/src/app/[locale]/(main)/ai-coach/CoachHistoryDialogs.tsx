"use client";

import type { CoachSessionListItem } from "@/api/ai-coach";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function CoachHistoryDialogs({
  deletePending,
  deleteTarget,
  editSession,
  editTitleValue,
  onConfirmDelete,
  onConfirmEdit,
  onDeleteOpenChange,
  onEditOpenChange,
  onEditTitleValueChange,
  t,
}: {
  deletePending: boolean;
  deleteTarget: CoachSessionListItem | null;
  editSession: CoachSessionListItem | null;
  editTitleValue: string;
  onConfirmDelete: () => void;
  onConfirmEdit: () => void;
  onDeleteOpenChange: (open: boolean) => void;
  onEditOpenChange: (open: boolean) => void;
  onEditTitleValueChange: (value: string) => void;
  t: (key: string) => string;
}) {
  return (
    <>
      <Dialog
        open={!!editSession}
        onOpenChange={(open) => onEditOpenChange(open)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("editTitleDialogTitle")}</DialogTitle>
          </DialogHeader>
          <Input
            value={editTitleValue}
            onChange={(event) => onEditTitleValueChange(event.target.value)}
            placeholder={t("editTitlePlaceholder")}
            maxLength={200}
            className="mt-2"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onConfirmEdit();
              }
            }}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEditOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="button" size="sm" onClick={onConfirmEdit}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => onDeleteOpenChange(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 px-3 text-mobile-caption pc:text-xs">
              {t("cancel")}
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deletePending}
              onClick={onConfirmDelete}
            >
              {t("deleteConfirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
