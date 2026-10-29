"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

export function Pagination({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
  disabled = false,
}: PaginationProps) {
  const t = useTranslations("activities");
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const hasPrevious = currentPage > 1;
  const hasNext = currentPage < totalPages;

  const handlePrevious = () => {
    if (hasPrevious && !disabled) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (hasNext && !disabled) {
      onPageChange(currentPage + 1);
    }
  };

  return (
    <div className="flex items-center justify-end space-x-1">
      <span className="text-sm text-muted-foreground mr-4">
        {t("pageLabel", { current: currentPage, total: totalPages })}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={handlePrevious}
        disabled={!hasPrevious || disabled}
      >
        <ChevronLeft className="h-4 w-4 lg:hidden" />
        <span className="hidden lg:block">{t("prevPage")}</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleNext}
        disabled={!hasNext || disabled}
      >
        <ChevronRight className="h-4 w-4 lg:hidden" />
        <span className="hidden lg:block">{t("nextPage")}</span>
      </Button>
    </div>
  );
}
