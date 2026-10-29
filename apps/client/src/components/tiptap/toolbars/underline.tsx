"use client";

import { UnderlineIcon } from "lucide-react";
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

const UnderlineToolbar = React.forwardRef<HTMLButtonElement, ButtonProps>(
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
              editor?.isActive("underline") && "bg-accent",
              className,
            )}
            onClick={(e) => {
              editor?.chain().focus().toggleUnderline().run();
              onClick?.(e);
            }}
            disabled={!editor?.can().chain().focus().toggleUnderline().run()}
            ref={ref}
            {...props}
          >
            {children ?? <UnderlineIcon className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <span>{t("underline")}</span>
          <span className="ml-1 text-mobile-caption pc:text-xs text-muted-foreground">
            {t("shortcutUnderline")}
          </span>
        </TooltipContent>
      </Tooltip>
    );
  },
);

UnderlineToolbar.displayName = "UnderlineToolbar";

export { UnderlineToolbar };
