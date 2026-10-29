"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

const ResponsiveModal = DialogPrimitive.Root;
const ResponsiveModalTrigger = DialogPrimitive.Trigger;
const ResponsiveModalClose = DialogPrimitive.Close;
const ResponsiveModalPortal = DialogPrimitive.Portal;

const ResponsiveModalOverlay = (props: DialogPrimitive.DialogOverlayProps) => {
  return (
    <DialogPrimitive.Overlay
      {...props}
      className={cn(
        "fixed inset-0 z-50 bg-background/80 backdrop-blur-xs",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        props.className,
      )}
    />
  );
};

const ResponsiveModalVariants = cva(
  cn(
    "fixed z-50 gap-4 overflow-y-auto overscroll-contain bg-background p-4 text-foreground shadow-lg transition ease-in-out pc:p-6",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=closed]:duration-300 data-[state=open]:duration-500",
    "pc:left-[50%] pc:top-[50%] pc:w-full pc:max-w-lg pc:translate-x-[-50%] pc:translate-y-[-50%]",
    "pc:border pc:duration-200 pc:data-[state=open]:animate-in pc:data-[state=closed]:animate-out",
    "pc:data-[state=closed]:fade-out-0 pc:data-[state=open]:fade-in-0",
    "pc:data-[state=closed]:zoom-out-95 pc:data-[state=open]:zoom-in-95 pc:rounded-overlay",
  ),
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b rounded-b-overlay max-h-[80dvh] pc:h-fit data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 max-h-[96dvh] rounded-t-overlay border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom pc:h-fit pc:max-h-[80dvh] pc:rounded-overlay",
        left: "inset-y-0 left-0 h-full pc:h-fit w-3/4 border-r rounded-r-overlay data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full pc:h-fit w-3/4 border-l rounded-l-overlay data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "bottom",
    },
  },
);

type ResponsiveModalContentProps = DialogPrimitive.DialogContentProps &
  VariantProps<typeof ResponsiveModalVariants>;

const ResponsiveModalContent = ({
  side = "bottom",
  className,
  children,
  ...props
}: ResponsiveModalContentProps) => {
  const t = useTranslations("SharedUI");

  return (
    <ResponsiveModalPortal>
      <ResponsiveModalOverlay />
      <DialogPrimitive.Content
        {...props}
        className={cn(ResponsiveModalVariants({ side }), className)}
      >
        {children}
        <ResponsiveModalClose className="absolute right-3 top-3 grid size-11 place-items-center rounded-full bg-muted opacity-100 ring-offset-background transition-opacity hover:bg-muted/80 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none pc:right-4 pc:top-4 pc:size-auto pc:rounded-sm pc:bg-transparent pc:opacity-70 pc:hover:opacity-100 pc:data-[state=open]:bg-secondary">
          <X className="size-[18px] pc:size-4" />
          <span className="sr-only">{t("close")}</span>
        </ResponsiveModalClose>
      </DialogPrimitive.Content>
    </ResponsiveModalPortal>
  );
};

const ResponsiveModalHeader = (props: HTMLAttributes<HTMLDivElement>) => (
  <div
    {...(props as React.HTMLAttributes<HTMLDivElement>)}
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      props.className,
    )}
  />
);

const ResponsiveModalFooter = (props: HTMLAttributes<HTMLDivElement>) => (
  <div
    {...(props as React.HTMLAttributes<HTMLDivElement>)}
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      props.className,
    )}
  />
);

const ResponsiveModalTitle = (props: DialogPrimitive.DialogTitleProps) => (
  <DialogPrimitive.Title
    {...props}
    className={cn("text-lg font-semibold text-foreground", props.className)}
  />
);

const ResponsiveModalDescription = (
  props: DialogPrimitive.DialogDescriptionProps,
) => (
  <DialogPrimitive.Description
    {...props}
    className={cn("text-sm text-muted-foreground", props.className)}
  />
);

export {
  ResponsiveModal,
  ResponsiveModalPortal,
  ResponsiveModalOverlay,
  ResponsiveModalTrigger,
  ResponsiveModalClose,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalFooter,
  ResponsiveModalTitle,
  ResponsiveModalDescription,
};
