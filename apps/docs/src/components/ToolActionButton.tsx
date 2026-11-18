"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import styles from "./tool-action-button.module.css";

type ToolActionButtonProps = Omit<
  ComponentProps<typeof Button>,
  "variant" | "size"
> & {
  intent?: "primary" | "secondary" | "quiet";
  fullWidth?: boolean;
};

export function ToolActionButton({
  intent = "primary",
  fullWidth = false,
  type = "button",
  className,
  ...props
}: ToolActionButtonProps) {
  return (
    <Button
      {...props}
      type={type}
      variant={
        intent === "quiet"
          ? "ghost"
          : intent === "primary"
            ? "default"
            : "secondary"
      }
      data-slot="tool-action"
      data-intent={intent}
      data-full-width={fullWidth || undefined}
      className={cn(styles.button, className)}
    />
  );
}
