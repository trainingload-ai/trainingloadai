"use client";

import { Redo2 } from "lucide-react";
import React from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useToolbar } from "./toolbar-provider";

const RedoToolbar = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, onClick, children, ...props }, ref) => {
    const t = useTranslations("RichTextToolbar");
    const { editor } = useToolbar();

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-editor"
            type="button"
            className={cn(className)}
            onClick={(e) => {
              editor?.chain().focus().redo().run();
              onClick?.(e);
            }}
            disabled={!editor?.can().chain().focus().redo().run()}
            ref={ref}
            {...props}
          >
            {children ?? <Redo2 className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <span>{t("redo")}</span>
        </TooltipContent>
      </Tooltip>
    );
  },
);

RedoToolbar.displayName = "RedoToolbar";

export { RedoToolbar };
