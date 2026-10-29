import React from "react";
import { useTranslations } from "next-intl";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogTrigger,
} from "@/components/ui/adaptive-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HelpCircle } from "lucide-react";
import { HeartRateZoneModel } from "@/api/settings";
import { settingsDialogDesktopClassName } from "@/components/ui/dialog-sizes";

interface HeartRateZoneHelpDialogProps {
  currentModel?: HeartRateZoneModel | string;
}

export function HeartRateZoneHelpDialog({
  currentModel,
}: HeartRateZoneHelpDialogProps) {
  const t = useTranslations("UserProfile");

  const getRowClass = (model: HeartRateZoneModel) => {
    return currentModel === model
      ? "bg-brand text-brand-foreground hover:bg-brand [&>td]:text-brand-foreground"
      : "";
  };

  const currentModelLabel = (
    <span className="sr-only">
      {` (${t("fields.heartRateZoneModel.help.current")})`}
    </span>
  );

  return (
    <AdaptiveDialog>
      <AdaptiveDialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t("fields.heartRateZoneModel.help.title")}
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </AdaptiveDialogTrigger>
      <AdaptiveDialogContent desktopClassName={settingsDialogDesktopClassName}>
        <AdaptiveDialogHeader>
          <AdaptiveDialogTitle>
            {t("fields.heartRateZoneModel.help.title")}
          </AdaptiveDialogTitle>
          <AdaptiveDialogDescription>
            {t("fields.heartRateZoneModel.help.description")}
          </AdaptiveDialogDescription>
        </AdaptiveDialogHeader>
        <div className="space-y-4 p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">
                  {t("fields.heartRateZoneModel.help.table.model")}
                </TableHead>
                <TableHead>
                  {t("fields.heartRateZoneModel.help.table.basis")}
                </TableHead>
                <TableHead>
                  {t("fields.heartRateZoneModel.help.table.features")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className={getRowClass(HeartRateZoneModel.KARVONEN)}>
                <TableCell className="font-medium">
                  {t("fields.heartRateZoneModel.help.models.karvonen.name")}
                  {currentModel === HeartRateZoneModel.KARVONEN
                    ? currentModelLabel
                    : null}
                </TableCell>
                <TableCell>
                  {t("fields.heartRateZoneModel.help.models.karvonen.basis")}
                </TableCell>
                <TableCell>
                  {t("fields.heartRateZoneModel.help.models.karvonen.features")}
                </TableCell>
              </TableRow>
              <TableRow className={getRowClass(HeartRateZoneModel.FRIEL)}>
                <TableCell className="font-medium">
                  {t("fields.heartRateZoneModel.help.models.friel.name")}
                  {currentModel === HeartRateZoneModel.FRIEL
                    ? currentModelLabel
                    : null}
                </TableCell>
                <TableCell>
                  {t("fields.heartRateZoneModel.help.models.friel.basis")}
                </TableCell>
                <TableCell>
                  {t("fields.heartRateZoneModel.help.models.friel.features")}
                </TableCell>
              </TableRow>
              <TableRow className={getRowClass(HeartRateZoneModel.MHR)}>
                <TableCell className="font-medium">
                  {t("fields.heartRateZoneModel.help.models.mhr.name")}
                  {currentModel === HeartRateZoneModel.MHR
                    ? currentModelLabel
                    : null}
                </TableCell>
                <TableCell>
                  {t("fields.heartRateZoneModel.help.models.mhr.basis")}
                </TableCell>
                <TableCell>
                  {t("fields.heartRateZoneModel.help.models.mhr.features")}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div className="text-sm text-muted-foreground bg-muted/45 p-3 rounded-md">
            {t("fields.heartRateZoneModel.help.fallback")}
          </div>
        </div>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
