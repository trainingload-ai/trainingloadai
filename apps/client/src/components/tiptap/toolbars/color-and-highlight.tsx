"use client";
// @ts-nocheck
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useToolbar } from "./toolbar-provider";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMediaQuery } from "@/hooks/use-media-querry";
import { MobileToolbarGroup, MobileToolbarItem } from "./mobile-toolbar-group";

type PaletteKey =
  | "default"
  | "gray"
  | "brown"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "red";

const PALETTE_ORDER: PaletteKey[] = [
  "default",
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
];

const TEXT_COLOR_VAR: Record<PaletteKey, string> = {
  default: "var(--editor-text-default)",
  gray: "var(--editor-text-gray)",
  brown: "var(--editor-text-brown)",
  orange: "var(--editor-text-orange)",
  yellow: "var(--editor-text-yellow)",
  green: "var(--editor-text-green)",
  blue: "var(--editor-text-blue)",
  purple: "var(--editor-text-purple)",
  pink: "var(--editor-text-pink)",
  red: "var(--editor-text-red)",
};

const HIGHLIGHT_COLOR_VAR: Record<PaletteKey, string> = {
  default: "var(--editor-highlight-default)",
  gray: "var(--editor-highlight-gray)",
  brown: "var(--editor-highlight-brown)",
  orange: "var(--editor-highlight-orange)",
  yellow: "var(--editor-highlight-yellow)",
  green: "var(--editor-highlight-green)",
  blue: "var(--editor-highlight-blue)",
  purple: "var(--editor-highlight-purple)",
  pink: "var(--editor-highlight-pink)",
  red: "var(--editor-highlight-red)",
};

interface ColorHighlightButtonProps {
  label: string;
  color: string;
  isActive: boolean;
  onClick: () => void;
  isHighlight?: boolean;
}

const ColorHighlightButton = ({
  label,
  color,
  isActive,
  onClick,
  isHighlight,
}: ColorHighlightButtonProps) => (
  <button
    onClick={onClick}
    className="flex w-full items-center justify-between rounded-sm px-2 py-1 text-sm hover:bg-muted"
    type="button"
  >
    <div className="flex items-center space-x-2">
      <div
        className="rounded-sm border px-1 py-px font-medium"
        style={isHighlight ? { backgroundColor: color } : { color }}
      >
        A
      </div>
      <span>{label}</span>
    </div>
    {isActive && <CheckIcon className="h-4 w-4" />}
  </button>
);

export const ColorHighlightToolbar = () => {
  const tPalette = useTranslations("RichTextToolbar.palette");
  const tCh = useTranslations("RichTextToolbar.colorHighlight");
  const { editor } = useToolbar();
  const isMobile = useMediaQuery("(max-width: 640px)");

  const currentColor = editor?.getAttributes("textStyle").color;
  const currentHighlight = editor?.getAttributes("highlight").color;

  const handleSetColor = (color: string) => {
    editor
      ?.chain()
      .focus()
      .setColor(color === currentColor ? "" : color)
      .run();
  };

  const handleSetHighlight = (color: string) => {
    editor
      ?.chain()
      .focus()
      ?.setHighlight(color === currentHighlight ? { color: "" } : { color })
      .run();
  };

  const isDisabled =
    !editor?.can().chain()?.setHighlight().run() ||
    !editor?.can().chain().setColor("").run();

  if (isMobile) {
    return (
      <div className="flex gap-1">
        <MobileToolbarGroup label={tCh("mobileColorGroup")}>
          {PALETTE_ORDER.map((key) => {
            const color = TEXT_COLOR_VAR[key];
            return (
              <MobileToolbarItem
                key={key}
                onClick={() => handleSetColor(color)}
                active={currentColor === color}
              >
                <div className="flex items-center gap-2">
                  <div className="rounded-sm border px-2" style={{ color }}>
                    A
                  </div>
                  <span>{tPalette(key)}</span>
                </div>
              </MobileToolbarItem>
            );
          })}
        </MobileToolbarGroup>

        <MobileToolbarGroup label={tCh("mobileHighlightGroup")}>
          {PALETTE_ORDER.map((key) => {
            const color = HIGHLIGHT_COLOR_VAR[key];
            return (
              <MobileToolbarItem
                key={key}
                onClick={() => handleSetHighlight(color)}
                active={currentHighlight === color}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="rounded-sm border px-2"
                    style={{ backgroundColor: color }}
                  >
                    A
                  </div>
                  <span>{tPalette(key)}</span>
                </div>
              </MobileToolbarItem>
            );
          })}
        </MobileToolbarGroup>
      </div>
    );
  }

  return (
    <Popover>
      <div className="relative h-full">
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger disabled={isDisabled} asChild>
              <Button
                variant="outline"
                size="toolbar-color"
                type="button"
                style={{
                  color: currentColor,
                }}
                className="font-normal"
              >
                <span className="text-md">A</span>
                <ChevronDownIcon className="ml-2 h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{tCh("tooltip")}</TooltipContent>
        </Tooltip>

        <PopoverContent
          align="start"
          className="w-56 border-border bg-popover p-1 text-popover-foreground"
        >
          <ScrollArea className="max-h-80 overflow-y-auto pr-2">
            <div className="mb-2.5 mt-2 px-2 text-mobile-caption pc:text-xs text-muted-foreground">
              {tCh("sectionTextColor")}
            </div>
            {PALETTE_ORDER.map((key) => (
              <ColorHighlightButton
                key={key}
                label={tPalette(key)}
                color={TEXT_COLOR_VAR[key]}
                isActive={currentColor === TEXT_COLOR_VAR[key]}
                onClick={() => handleSetColor(TEXT_COLOR_VAR[key])}
              />
            ))}

            <Separator className="my-3" />

            <div className="mb-2.5 w-full px-2 pr-3 text-mobile-caption pc:text-xs text-muted-foreground">
              {tCh("sectionBackground")}
            </div>
            {PALETTE_ORDER.map((key) => (
              <ColorHighlightButton
                key={key}
                label={tPalette(key)}
                color={HIGHLIGHT_COLOR_VAR[key]}
                isActive={currentHighlight === HIGHLIGHT_COLOR_VAR[key]}
                onClick={() => handleSetHighlight(HIGHLIGHT_COLOR_VAR[key])}
                isHighlight
              />
            ))}
          </ScrollArea>
        </PopoverContent>
      </div>
    </Popover>
  );
};
