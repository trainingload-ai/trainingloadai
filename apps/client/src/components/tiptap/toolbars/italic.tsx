"use client";

import { ItalicIcon } from "lucide-react";
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

const ItalicToolbar = React.forwardRef<HTMLButtonElement, ButtonProps>(
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
            className={cn(editor?.isActive("italic") && "bg-accent", className)}
            onClick={(e) => {
              editor?.chain().focus().toggleItalic().run();
              onClick?.(e);
            }}
            disabled={!editor?.can().chain().focus().toggleItalic().run()}
            ref={ref}
            {...props}
          >
            {children ?? <ItalicIcon className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <span>{t("italic")}</span>
          <span className="ml-1 text-mobile-caption pc:text-xs text-muted-foreground">
            {t("shortcutItalic")}
          </span>
        </TooltipContent>
      </Tooltip>
    );
  },
);

ItalicToolbar.displayName = "ItalicToolbar";

export { ItalicToolbar };
