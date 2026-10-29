import { cn } from "@/lib/utils";
import { TrendingDown, TrendingUp } from "lucide-react";

interface ChangePercentageProps {
  current: number;
  previous: number;
  reverseColor?: boolean;
}

const ChangePercentage = ({
  current,
  previous,
  reverseColor,
}: ChangePercentageProps) => {
  const change = ((current - previous) / previous) * 100;

  if (previous === 0) {
    if (current === 0) {
      return <div className="text-sm">0%</div>;
    }
    return <div className="text-sm">+999%</div>;
  }

  if (change === 0) {
    return <div className="text-sm">0%</div>;
  }

  return (
    <div
      className={cn(
        "text-mobile-caption pc:text-xs flex items-center gap-1",
        (reverseColor ? -change : change) > 0
          ? "text-emerald-400"
          : "text-red-400"
      )}
    >
      {change > 0 ? (
        <TrendingUp className="w-4 h-4" />
      ) : (
        <TrendingDown className="w-4 h-4" />
      )}
      {Math.abs(change).toFixed(1)}%
    </div>
  );
};

export default ChangePercentage;
