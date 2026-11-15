"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import styles from "./tool-choices.module.css";

export function ToolChoiceGroup<Value extends string>({
  value,
  onValueChange,
  label,
  options,
  presentation = "segmented",
  fullWidth = false,
  disabled = false,
  required,
  name,
}: {
  value: Value;
  onValueChange: (value: Value) => void;
  label: string;
  options: readonly { value: Value; label: ReactNode; id?: string }[];
  presentation?: "segmented" | "radio" | "chips";
  fullWidth?: boolean;
  disabled?: boolean;
  required?: boolean;
  name?: string;
}) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(next) => onValueChange(next as Value)}
      orientation="horizontal"
      disabled={disabled}
      required={required}
      name={name}
      aria-label={label}
      data-slot="tool-choice-group"
      data-presentation={presentation}
      data-full-width={fullWidth || undefined}
      className={styles.group}
    >
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          type="button"
          id={option.id}
          value={option.value}
          className={styles.item}
        >
          {presentation === "radio" ? (
            <span className={styles.radioMark} aria-hidden="true">
              <RadioGroupPrimitive.Indicator className={styles.dot} />
            </span>
          ) : null}
          <span>{option.label}</span>
          {presentation !== "radio" ? (
            <RadioGroupPrimitive.Indicator
              forceMount
              className={styles.check}
              aria-hidden="true"
            >
              <Check />
            </RadioGroupPrimitive.Indicator>
          ) : null}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
