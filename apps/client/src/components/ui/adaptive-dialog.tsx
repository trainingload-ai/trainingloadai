"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

type AdaptiveDialogVariant = "auto" | "dialog" | "drawer";

type AdaptiveDialogResolvedVariant = Exclude<AdaptiveDialogVariant, "auto">;

type AdaptiveDialogContextValue = {
  variant: AdaptiveDialogResolvedVariant;
};

const AdaptiveDialogContext =
  React.createContext<AdaptiveDialogContextValue | null>(null);

function useAdaptiveDialogContext() {
  const ctx = React.useContext(AdaptiveDialogContext);
  if (!ctx) {
    throw new Error(
      "AdaptiveDialog components must be used within AdaptiveDialog",
    );
  }
  return ctx;
}

type AdaptiveDialogRootProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export type AdaptiveDialogProps = AdaptiveDialogRootProps & {
  variant?: AdaptiveDialogVariant;
  children: React.ReactNode;
  modal?: React.ComponentProps<typeof Dialog>["modal"];
  shouldScaleBackground?: React.ComponentProps<
    typeof Drawer
  >["shouldScaleBackground"];
};

export function AdaptiveDialog({
  variant = "auto",
  open,
  defaultOpen,
  onOpenChange,
  modal,
  shouldScaleBackground,
  children,
}: AdaptiveDialogProps) {
  const isMobile = useIsMobile();
  const resolvedVariant: AdaptiveDialogResolvedVariant =
    variant === "auto" ? (isMobile ? "drawer" : "dialog") : variant;

  return (
    <AdaptiveDialogContext.Provider value={{ variant: resolvedVariant }}>
      {resolvedVariant === "drawer" ? (
        <Drawer
          open={open}
          defaultOpen={defaultOpen}
          onOpenChange={onOpenChange}
          shouldScaleBackground={shouldScaleBackground}
        >
          {children}
        </Drawer>
      ) : (
        <Dialog
          open={open}
          defaultOpen={defaultOpen}
          onOpenChange={onOpenChange}
          modal={modal}
        >
          {children}
        </Dialog>
      )}
    </AdaptiveDialogContext.Provider>
  );
}

export function AdaptiveDialogTrigger(
  props: React.ComponentProps<typeof DialogTrigger>,
) {
  const { variant } = useAdaptiveDialogContext();
  return variant === "drawer" ? (
    <DrawerTrigger {...(props as React.ComponentProps<typeof DrawerTrigger>)} />
  ) : (
    <DialogTrigger {...props} />
  );
}

export function AdaptiveDialogClose(
  props: React.ComponentProps<typeof DialogClose>,
) {
  const { variant } = useAdaptiveDialogContext();
  return variant === "drawer" ? (
    <DrawerClose {...(props as React.ComponentProps<typeof DrawerClose>)} />
  ) : (
    <DialogClose {...props} />
  );
}

export type AdaptiveDialogContentProps = {
  children?: React.ReactNode;
  className?: string;
  desktopClassName?: string;
  mobileClassName?: string;
  desktopProps?: Omit<
    React.ComponentProps<typeof DialogContent>,
    "children" | "className"
  >;
  mobileProps?: Omit<
    React.ComponentProps<typeof DrawerContent>,
    "children" | "className"
  >;
};

export const AdaptiveDialogContent = React.forwardRef<
  HTMLDivElement,
  AdaptiveDialogContentProps
>(
  (
    {
      className,
      desktopClassName,
      mobileClassName,
      desktopProps,
      mobileProps,
      children,
    },
    ref,
  ) => {
    const { variant } = useAdaptiveDialogContext();
    const mergedClassName = cn(
      className,
      variant === "drawer" ? mobileClassName : desktopClassName,
    );

    const DrawerBody = DrawerContent as React.ComponentType<{
      ref?: React.Ref<HTMLDivElement>;
      className?: string;
      children?: React.ReactNode;
    }>;

    return variant === "drawer" ? (
      <DrawerBody
        ref={ref as React.Ref<HTMLDivElement>}
        className={mergedClassName}
      >
        {children}
      </DrawerBody>
    ) : (
      <DialogContent
        ref={ref as React.Ref<HTMLDivElement>}
        className={mergedClassName}
        {...desktopProps}
      >
        {children}
      </DialogContent>
    );
  },
);
AdaptiveDialogContent.displayName = "AdaptiveDialogContent";

export function AdaptiveDialogHeader(props: React.ComponentProps<"div">) {
  const { variant } = useAdaptiveDialogContext();
  return variant === "drawer" ? (
    <DrawerHeader {...props} />
  ) : (
    <DialogHeader {...props} />
  );
}

export function AdaptiveDialogFooter(props: React.ComponentProps<"div">) {
  const { variant } = useAdaptiveDialogContext();
  return variant === "drawer" ? (
    <DrawerFooter {...props} />
  ) : (
    <DialogFooter {...props} />
  );
}

export function AdaptiveDialogTitle(
  props: React.ComponentProps<typeof DialogTitle>,
) {
  const { variant } = useAdaptiveDialogContext();
  return variant === "drawer" ? (
    <DrawerTitle {...(props as React.ComponentProps<typeof DrawerTitle>)} />
  ) : (
    <DialogTitle {...props} />
  );
}

export function AdaptiveDialogDescription(
  props: React.ComponentProps<typeof DialogDescription>,
) {
  const { variant } = useAdaptiveDialogContext();
  return variant === "drawer" ? (
    <DrawerDescription
      {...(props as React.ComponentProps<typeof DrawerDescription>)}
    />
  ) : (
    <DialogDescription {...props} />
  );
}

/**
 * AdaptiveDialog 底部主操作区（取消/确认等）：横排均分，抵消 DialogFooter 默认 `sm:justify-end`。
 */
export const adaptiveDialogFooterActionsClassName = cn(
  "w-full flex-row gap-2 sm:gap-3 justify-stretch sm:justify-stretch",
);

/**
 * 底部主按钮样式（outline / default 共用）。配合 {@link adaptiveDialogFooterActionsClassName}，
 * 按钮尺寸统一使用 `size="dialog-action"`。
 */
export const adaptiveDialogFooterActionButtonClassName = cn(
  "flex-1 basis-0 min-w-0 touch-manipulation",
);

/** 左侧说明 + 右侧按钮等混合 footer（如图表下方提示条） */
export const adaptiveDialogFooterToolbarClassName = cn(
  "w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
);
