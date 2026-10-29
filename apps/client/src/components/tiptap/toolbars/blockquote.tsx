"use client";

import { TextQuote } from "lucide-react";
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

const BlockquoteToolbar = React.forwardRef<HTMLButtonElement, ButtonProps>(
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
              editor?.isActive("blockquote") && "bg-accent",
              className,
            )}
            onClick={(e) => {
              editor?.chain().focus().toggleBlockquote().run();
              onClick?.(e);
            }}
            disabled={!editor?.can().chain().focus().toggleBlockquote().run()}
            ref={ref}
            {...props}
          >
            {children ?? <TextQuote className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <span>{t("blockquote")}</span>
        </TooltipContent>
      </Tooltip>
    );
  },
);

BlockquoteToolbar.displayName = "BlockquoteToolbar";

export { BlockquoteToolbar };
