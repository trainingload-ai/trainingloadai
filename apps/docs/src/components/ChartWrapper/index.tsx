import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import LOGO from "@/components/LOGO";

interface ChartWrapperProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export default function ChartWrapper({
  children,
  className,
  contentClassName,
}: ChartWrapperProps) {
  return (
    <Card className={`overflow-hidden flex flex-col ${className || ""}`}>
      <CardContent
        className={`flex-1 p-2 lg:p-2 flex flex-col gap-2 ${contentClassName || ""}`}
      >
        <div className="flex items-center justify-between px-2 md:px-0">
          <div className="flex items-center gap-2">
            <LOGO width={20} height={20} />
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
