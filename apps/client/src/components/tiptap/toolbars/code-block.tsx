"use client";

import { Code } from "lucide-react";
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

const CodeBlockToolbar = React.forwardRef<HTMLButtonElement, ButtonProps>(
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
            className={cn(
              editor?.isActive("codeBlock") && "bg-accent",
              className,
            )}
            onClick={(e) => {
              editor?.chain().focus().toggleCodeBlock().run();
              onClick?.(e);
            }}
            disabled={!editor?.can().chain().focus().toggleCodeBlock().run()}
            ref={ref}
            {...props}
          >
            {children ?? <Code className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <span>{t("codeBlock")}</span>
        </TooltipContent>
      </Tooltip>
    );
  },
);

CodeBlockToolbar.displayName = "CodeBlockToolbar";

export { CodeBlockToolbar };
