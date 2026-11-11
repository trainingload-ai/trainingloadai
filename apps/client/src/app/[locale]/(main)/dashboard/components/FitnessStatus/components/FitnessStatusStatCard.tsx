"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { FitnessStatCard } from "./SortableFitnessStatCard";

export function FitnessStatusStatCard({
  stat,
  className,
  onClick,
  subContent,
  rightAccessory,
  valueAccessory,
}: {
  stat: FitnessStatCard;
  className?: string;
  onClick?: () => void;
  subContent: React.ReactNode;
  rightAccessory?: React.ReactNode;
  valueAccessory?: React.ReactNode;
}) {
  return (
    <Card
      data-metric={stat.key}
      className={cn(
        "relative overflow-hidden border-0 bg-neutral-100 dark:bg-muted/45 shadow-none transition-colors hover:bg-neutral-200 dark:hover:bg-muted p-2",
        className,
        onClick && "tap-feedback",
      )}
      onClick={onClick}
    >
      <CardHeader className="p-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
        <div className={cn("rounded-full", stat.bgColor)}>
          <stat.icon className={cn("h-4 w-4", stat.color)} />
        </div>
      </CardHeader>
      <CardContent className="lg:p-2">
        <div className="mt-2 sm:mt-6">
          <div
            className={cn(
              "flex items-end justify-between gap-4",
              stat.key === "vo2Max" && "mb-3",
            )}
          >
            <div
              className={cn(
                "text-2xl font-bold",
                stat.key === "vo2Max" &&
                  "text-4xl leading-none tracking-tight tabular-nums",
              )}
            >
              {stat.value}
              {stat.unit && (
                <span className="text-mobile-caption pc:text-xs font-normal text-muted-foreground ml-1">
                  {stat.unit}
                </span>
              )}
            </div>
            {valueAccessory}
          </div>
          <div className="flex items-center justify-between">
            {subContent}
            <div className="w-6 shrink-0 flex justify-end">
              {rightAccessory}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
