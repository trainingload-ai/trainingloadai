"use client";

import {
  DropdownMenuCheckboxItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Filter } from "lucide-react";
import { SportType } from "@/lib/store";
import { useTranslations } from "next-intl";

interface SportTypeFilterProps {
  selectedSportType: SportType;
  setSportType: (type: SportType) => void;
  allowAll?: boolean;
  compactAllLabel?: boolean;
  allowedSportTypes?: Array<Exclude<SportType, "all">>;
}

const SPORT_TYPES: Array<Exclude<SportType, "all">> = [
  "RUN",
  "CYCLING",
  "SWIM",
];

export function SportTypeFilter({
  selectedSportType,
  setSportType,
  allowAll = true,
  compactAllLabel = false,
  allowedSportTypes = SPORT_TYPES,
}: SportTypeFilterProps) {
  const t = useTranslations("activityFilter");

  const getTypeLabel = (type: SportType) => {
    switch (type) {
      case "all":
        return compactAllLabel ? t("all") : t("allTypes");
      case "RUN":
        return t("run");
      case "CYCLING":
        return t("cycling");
      case "SWIM":
        return t("swim");
      default:
        return t("allTypes");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        variant="outline"
        size="sm"
        className="w-full justify-center gap-1.5 border-border/70 bg-neutral-100 text-foreground hover:bg-neutral-200 dark:bg-muted/45 dark:hover:bg-muted sm:w-auto sm:justify-start"
      >
        <Filter className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 max-w-[10rem] truncate sm:max-w-[6rem]">
          {getTypeLabel(selectedSportType)}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-36">
        {allowAll ? (
          <DropdownMenuCheckboxItem
            checked={selectedSportType === "all"}
            onSelect={(event) => {
              event.preventDefault();
              setSportType("all");
            }}
          >
            <span>{compactAllLabel ? t("all") : t("allTypes")}</span>
          </DropdownMenuCheckboxItem>
        ) : null}
        {allowedSportTypes.map((type) => (
          <DropdownMenuCheckboxItem
            key={type}
            checked={selectedSportType === type}
            onSelect={(event) => {
              event.preventDefault();
              setSportType(type);
            }}
          >
            <span>{getTypeLabel(type)}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default SportTypeFilter;
