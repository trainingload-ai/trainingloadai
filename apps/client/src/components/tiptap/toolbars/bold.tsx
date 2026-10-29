"use client";

import { BoldIcon } from "lucide-react";
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
// import type { Extension } from "@tiptap/core";
// import type { StarterKitOptions } from "@tiptap/starter-kit";

// type StarterKitExtensions = Extension<StarterKitOptions>;

const BoldToolbar = React.forwardRef<HTMLButtonElement, ButtonProps>(
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
            className={cn(editor?.isActive("bold") && "bg-accent", className)}
            onClick={(e) => {
              editor?.chain().focus().toggleBold().run();
              onClick?.(e);
            }}
            disabled={!editor?.can().chain().focus().toggleBold().run()}
            ref={ref}
            {...props}
          >
            {children ?? <BoldIcon className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <span>{t("bold")}</span>
          <span className="ml-1 text-mobile-caption pc:text-xs text-muted-foreground">
            {t("shortcutBold")}
          </span>
        </TooltipContent>
      </Tooltip>
    );
  },
);

BoldToolbar.displayName = "BoldToolbar";

export { BoldToolbar };
