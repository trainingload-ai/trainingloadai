"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import TrimpChart from "./TrimpChart";

interface TrimpChartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const TrimpChartModal: React.FC<TrimpChartModalProps> = ({
  open,
  onOpenChange,
}) => {
  const t = useTranslations("HeartRatePage.trimpInfo");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] max-w-[90vw] flex-col gap-0 overflow-hidden md:max-w-[50vw] pc:max-h-[85dvh]">
        <DialogHeader className="shrink-0 pr-12">
          <DialogTitle className="flex items-center gap-2 text-lg">
            {t("title")}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain pr-2 [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]">
          <TrimpChart />
        </div>
      </DialogContent>
    </Dialog>
  );
};
