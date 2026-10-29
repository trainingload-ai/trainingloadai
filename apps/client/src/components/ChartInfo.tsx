import React from "react";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogTrigger,
} from "@/components/ui/adaptive-dialog";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChartInfoProps {
  title: string;
  children: React.ReactNode;
}

const ChartInfo: React.FC<ChartInfoProps> = ({ title, children }) => {
  return (
    <AdaptiveDialog>
      <AdaptiveDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="sr-only">{title}</span>
        </Button>
      </AdaptiveDialogTrigger>
      <AdaptiveDialogContent desktopClassName="max-w-md gap-6">
        <AdaptiveDialogHeader>
          <AdaptiveDialogTitle className="flex items-center gap-2 text-lg">
            {title}
          </AdaptiveDialogTitle>
        </AdaptiveDialogHeader>

        <div className="space-y-4 text-sm text-muted-foreground">
          {children}
        </div>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
};

export default ChartInfo;
