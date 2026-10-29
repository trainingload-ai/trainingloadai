"use client";

import { Code2 } from "lucide-react";
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

const CodeToolbar = React.forwardRef<HTMLButtonElement, ButtonProps>(
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
            className={cn(editor?.isActive("code") && "bg-accent", className)}
            onClick={(e) => {
              editor?.chain().focus().toggleCode().run();
              onClick?.(e);
            }}
            disabled={!editor?.can().chain().focus().toggleCode().run()}
            ref={ref}
            {...props}
          >
            {children ?? <Code2 className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <span>{t("code")}</span>
        </TooltipContent>
      </Tooltip>
    );
  },
);

CodeToolbar.displayName = "CodeToolbar";

export { CodeToolbar };
