import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./tool-result-actions.module.css";

export function ToolResultActions({
  leading,
  children,
  className,
}: {
  leading?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-slot="tool-result-actions" className={cn(styles.row, className)}>
      {leading ? <div className={styles.leading}>{leading}</div> : null}
      <div className={styles.exports}>{children}</div>
    </div>
  );
}
