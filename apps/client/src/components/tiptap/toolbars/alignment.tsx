"use client";

import type { ReactNode } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Check,
  ChevronDown,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMediaQuery } from "@/hooks/use-media-querry";
import { MobileToolbarGroup, MobileToolbarItem } from "./mobile-toolbar-group";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToolbar } from "./toolbar-provider";

type AlignKey = "left" | "center" | "right" | "justify";

export const AlignmentTooolbar = () => {
  const t = useTranslations("RichTextToolbar.alignment");
  const { editor } = useToolbar();
  const isMobile = useMediaQuery("(max-width: 640px)");
  const handleAlign = (value: string) => {
    editor?.chain().focus()?.setTextAlign(value).run();
  };

  const isDisabled =
    !editor || editor.isActive("image") || editor.isActive("video");

  const currentTextAlign = (): AlignKey => {
    if (editor?.isActive({ textAlign: "left" })) {
      return "left";
    }
    if (editor?.isActive({ textAlign: "center" })) {
      return "center";
    }
    if (editor?.isActive({ textAlign: "right" })) {
      return "right";
    }
    if (editor?.isActive({ textAlign: "justify" })) {
      return "justify";
    }

    return "left";
  };

  const alignmentOptions: { value: AlignKey; icon: ReactNode }[] = [
    {
      value: "left",
      icon: <AlignLeft className="h-4 w-4" />,
    },
    {
      value: "center",
      icon: <AlignCenter className="h-4 w-4" />,
    },
    {
      value: "right",
      icon: <AlignRight className="h-4 w-4" />,
    },
    {
      value: "justify",
      icon: <AlignJustify className="h-4 w-4" />,
    },
  ];

  const alignLabel = (value: AlignKey) => t(value);

  const findIndex = (value: AlignKey) => {
    return alignmentOptions.findIndex((option) => option.value === value);
  };

  if (isMobile) {
    return (
      <MobileToolbarGroup label={alignLabel(currentTextAlign())}>
        {alignmentOptions.map((option, index) => (
          <MobileToolbarItem
            key={index}
            onClick={() => handleAlign(option.value)}
            active={currentTextAlign() === option.value}
          >
            <span className="mr-2">{option.icon}</span>
            {alignLabel(option.value)}
          </MobileToolbarItem>
        ))}
      </MobileToolbarGroup>
    );
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger disabled={isDisabled} asChild unstyled>
            <Button
              variant="outline"
              size="sm"
              className="w-max font-normal text-foreground"
              type="button"
            >
              <span className="mr-2">
                {alignmentOptions[findIndex(currentTextAlign())]?.icon}
              </span>
              {alignLabel(currentTextAlign())}
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("tooltip")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        loop
        onCloseAutoFocus={(e) => {
          e.preventDefault();
        }}
      >
        <DropdownMenuGroup className=" w-40">
          {alignmentOptions.map((option, index) => (
            <DropdownMenuItem
              onSelect={() => {
                handleAlign(option.value);
              }}
              key={index}
            >
              <span className="mr-2">{option.icon}</span>
              {alignLabel(option.value)}

              {option.value === currentTextAlign() && (
                <Check className="ml-auto h-4 w-4" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
