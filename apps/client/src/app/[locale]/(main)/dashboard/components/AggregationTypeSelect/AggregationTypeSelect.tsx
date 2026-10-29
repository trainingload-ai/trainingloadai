import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslations } from "next-intl";

export type AggregationType = "avg" | "max" | "min";

interface AggregationTypeSelectProps {
  value: AggregationType;
  onValueChange: (value: AggregationType) => void;
}

function getAggregationLabel(
  type: AggregationType,
  t: (key: string) => string
): string {
  switch (type) {
    case "avg":
      return t("average");
    case "max":
      return t("maximum");
    case "min":
      return t("minimum");
    default:
      return t("average");
  }
}

export function AggregationTypeSelect({
  value,
  onValueChange,
}: AggregationTypeSelectProps) {
  const t = useTranslations("dashboard");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="text-mobile-caption pc:text-xs sm:text-mobile-caption p-2 xs:p-3 h-4"
        variant={"outline"}
      >
        {getAggregationLabel(value, t)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-20">
        <DropdownMenuItem asChild>
          <Button
            variant={value === "avg" ? "outline" : "ghost"}
            className="w-full justify-between"
            size={"xs"}
            onClick={() => onValueChange("avg")}
          >
            <span>{t("average")}</span>
            {value === "avg" && (
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            )}
          </Button>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Button
            variant={value === "max" ? "outline" : "ghost"}
            className="w-full justify-between"
            size={"xs"}
            onClick={() => onValueChange("max")}
          >
            <span>{t("maximum")}</span>
            {value === "max" && (
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            )}
          </Button>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Button
            variant={value === "min" ? "outline" : "ghost"}
            className="w-full justify-between"
            size={"xs"}
            onClick={() => onValueChange("min")}
          >
            <span>{t("minimum")}</span>
            {value === "min" && (
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            )}
          </Button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
