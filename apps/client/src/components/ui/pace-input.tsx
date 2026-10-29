import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const PaceInput = ({
  value,
  onChange,
  className,
  disabled,
  size = "default",
  ...props
}: {
  value: number | undefined;
  onChange: (val: number | undefined) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "default";
} & Omit<React.ComponentProps<"div">, "onChange">) => {
  const minutesFromValue =
    typeof value === "number" && value > 0 ? Math.floor(value / 60) : 0;
  const secondsFromValue =
    typeof value === "number" && value > 0 ? Math.floor(value % 60) : 0;

  const [minutes, setMinutes] = React.useState<string>(String(minutesFromValue));
  const [seconds, setSeconds] = React.useState<string>(
    secondsFromValue.toString().padStart(2, "0"),
  );

  React.useEffect(() => {
    setMinutes(String(minutesFromValue));
    setSeconds(secondsFromValue.toString().padStart(2, "0"));
  }, [minutesFromValue, secondsFromValue]);

  const minuteOptions = React.useMemo(
    () => Array.from({ length: 60 }, (_, i) => String(i)),
    [],
  );
  const secondOptions = React.useMemo(
    () => Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0")),
    [],
  );
  const triggerClassName = cn(
    size === "sm" ? "w-16" : "w-[74px]",
    "bg-background",
  );

  const emit = React.useCallback(
    (nextMinutes: string, nextSeconds: string) => {
      const m = Number(nextMinutes);
      const s = Number(nextSeconds);
      if (!Number.isFinite(m) || !Number.isFinite(s)) return;
      const total = m * 60 + s;
      onChange(total > 0 ? total : undefined);
    },
    [onChange],
  );

  const onMinutesChange = (next: string) => {
    setMinutes(next);
    emit(next, seconds);
  };
  const onSecondsChange = (next: string) => {
    setSeconds(next);
    emit(minutes, next);
  };

  return (
    <div className={cn("flex items-center gap-1", className)} {...props}>
      <Select value={minutes} onValueChange={onMinutesChange} disabled={disabled}>
        <SelectTrigger size={size} className={triggerClassName}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {minuteOptions.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-sm text-muted-foreground">:</span>
      <Select value={seconds} onValueChange={onSecondsChange} disabled={disabled}>
        <SelectTrigger size={size} className={triggerClassName}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {secondOptions.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
