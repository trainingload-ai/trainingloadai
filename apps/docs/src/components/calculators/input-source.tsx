"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ToolTabsList } from "@/components/ToolTabsList";
import styles from "../tool-tabs.module.css";

export function InputSource({
  value,
  onValueChange,
  label,
  manual,
  file,
  children,
}: {
  value: "manual" | "file";
  onValueChange: (value: "manual" | "file") => void;
  label: string;
  manual: string;
  file: string;
  children: ReactNode;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onValueChange(next as "manual" | "file")}
      className={styles.source}
    >
      <ToolTabsList
        value={value}
        label={label}
        options={[
          { value: "manual", label: manual },
          { value: "file", label: file },
        ]}
      />
      <TabsContent value={value} tabIndex={-1} className={styles.panel}>
        {children}
      </TabsContent>
    </Tabs>
  );
}
