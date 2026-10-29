"use client";

import React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useToolbar } from "./toolbar-provider";
import { useMediaQuery } from "@/hooks/use-media-querry";
import { MobileToolbarGroup, MobileToolbarItem } from "./mobile-toolbar-group";

const levels = [1, 2, 3, 4] as const;

export const HeadingsToolbar = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => {
  const t = useTranslations("RichTextToolbar");
  const { editor } = useToolbar();
  const isMobile = useMediaQuery("(max-width: 640px)");
  const activeLevel = levels.find((level) =>
    editor?.isActive("heading", { level }),
  );

  if (isMobile) {
    return (
      <MobileToolbarGroup
        label={
          activeLevel
            ? t("headings.levelLabel", { level: activeLevel })
            : t("headings.normal")
        }
      >
        <MobileToolbarItem
          onClick={() => editor?.chain().focus().setParagraph().run()}
          active={!editor?.isActive("heading")}
        >
          {t("headings.normal")}
        </MobileToolbarItem>
        {levels.map((level) => (
          <MobileToolbarItem
            key={level}
            onClick={() =>
              editor?.chain().focus().toggleHeading({ level }).run()
            }
            active={editor?.isActive("heading", { level })}
          >
            {t("headings.levelLabel", { level })}
          </MobileToolbarItem>
        ))}
      </MobileToolbarGroup>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenu>
          <DropdownMenuTrigger asChild unstyled>
            <Button
              variant="outline"
              size="sm"
              type="button"
              className={cn(
                "w-max gap-1 font-normal text-foreground",
                editor?.isActive("heading") &&
                  "bg-accent text-accent-foreground",
                className,
              )}
              ref={ref}
              {...props}
            >
              {activeLevel
                ? t("headings.levelLabel", { level: activeLevel })
                : t("headings.normal")}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() => editor?.chain().focus().setParagraph().run()}
              className={cn(
                "flex items-center gap-2 h-fit",
                !editor?.isActive("heading") && "bg-accent",
              )}
            >
              {t("headings.normal")}
            </DropdownMenuItem>
            {levels.map((level) => (
              <DropdownMenuItem
                key={level}
                onClick={() =>
                  editor?.chain().focus().toggleHeading({ level }).run()
                }
                className={cn(
                  "flex items-center gap-2",
                  editor?.isActive("heading", { level }) && "bg-accent",
                )}
              >
                {t("headings.levelLabel", { level })}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </TooltipTrigger>
      <TooltipContent>
        <span>{t("headings.tooltip")}</span>
      </TooltipContent>
    </Tooltip>
  );
});

HeadingsToolbar.displayName = "HeadingsToolbar";
