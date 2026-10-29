import { useStore, type ChartXaxis } from "@/lib/store";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

const YAxisSelection = () => {
  const t = useTranslations("ChartAxis");
  const options = [
    { label: t("distance"), value: "distance" },
    { label: t("time"), value: "time" },
  ];

  const { chartXaxis, setChartXaxis } = useStore();

  return (
    <Select
      value={chartXaxis}
      onValueChange={(value) => setChartXaxis(value as ChartXaxis)}
    >
      <SelectTrigger className="w-[160px]">
        <SelectValue placeholder={t("selectXAxis")} />
      </SelectTrigger>
      <SelectContent>
        {options.map((v) => (
          <SelectItem key={v.value} value={v.value}>
            {v.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default YAxisSelection;
