"use client";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export function InputSource({
  value,
  onValueChange,
  label,
  manual,
  file,
}: {
  value: "manual" | "file";
  onValueChange: (value: "manual" | "file") => void;
  label: string;
  manual: string;
  file: string;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onValueChange(next as "manual" | "file")}
      orientation="horizontal"
      aria-label={label}
      className="flex flex-wrap gap-x-6 gap-y-3 border-b border-border pb-4"
    >
      {(
        [
          ["manual", manual],
          ["file", file],
        ] as const
      ).map(([key, text]) => (
        <label
          key={key}
          className="flex cursor-pointer items-center gap-2 text-sm font-medium"
        >
          <RadioGroupItem value={key} />
          {text}
        </label>
      ))}
    </RadioGroup>
  );
}
