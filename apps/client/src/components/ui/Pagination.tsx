"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  variant?: "default" | "compact";
}

export function Pagination({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
  disabled = false,
  variant = "default",
}: PaginationProps) {
  const t = useTranslations("activities");
  const format = useFormatter();
  const compact = variant === "compact";
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

  const pageLabel = t("pageLabel", { current: currentPage, total: totalPages });
  const buttonClassName = compact
    ? "aria-disabled:pointer-events-none aria-disabled:opacity-50 [@media(pointer:coarse)]:size-11"
    : undefined;
  return (
    <div className={cn("flex items-center justify-end", compact ? "gap-1" : "space-x-1")}>
      {!compact && <span className="mr-4 text-sm text-muted-foreground">{pageLabel}</span>}
      <Button
        type="button"
        variant={compact ? "ghost" : "outline"}
        size={compact ? "icon-sm" : "sm"}
        className={buttonClassName}
        onClick={handlePrevious}
        aria-label={t("prevPage")}
        aria-disabled={compact ? !hasPrevious || disabled : undefined}
        disabled={!compact && (!hasPrevious || disabled)}
      >
        <ChevronLeft aria-hidden className={cn("size-4 rtl:rotate-180", !compact && "lg:hidden")} />
        {!compact && <span className="hidden lg:block">{t("prevPage")}</span>}
      </Button>
      {compact && (
        <span role="status" className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
          <span className="sr-only">{pageLabel}</span>
          <span aria-hidden>{format.number(currentPage)} / {format.number(totalPages)}</span>
        </span>
      )}
      <Button
        type="button"
        variant={compact ? "ghost" : "outline"}
        size={compact ? "icon-sm" : "sm"}
        className={buttonClassName}
        onClick={handleNext}
        aria-label={t("nextPage")}
        aria-disabled={compact ? !hasNext || disabled : undefined}
        disabled={!compact && (!hasNext || disabled)}
      >
        <ChevronRight aria-hidden className={cn("size-4 rtl:rotate-180", !compact && "lg:hidden")} />
        {!compact && <span className="hidden lg:block">{t("nextPage")}</span>}
      </Button>
    </div>
  );
}
