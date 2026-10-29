"use client";

import React from "react";

import { cn } from "@/lib/utils";

interface ChartToolContainerProps {
  children?: React.ReactNode;
  className?: string;
}

const ChartToolContainer: React.FC<ChartToolContainerProps> = ({
  children,
  className,
}) => {
  if (!children) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-full border-0 bg-transparent p-0",
        className,
      )}
    >
      {children}
    </div>
  );
};

export default ChartToolContainer;
