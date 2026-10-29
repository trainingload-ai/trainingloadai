import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "tap-feedback inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-medium transition-[background-color,color,border-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        brand:
          "bg-brand text-brand-foreground hover:bg-brand/85 active:bg-brand/75",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-card text-foreground hover:bg-muted hover:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        auto: "h-auto",
        default: "h-9 px-4 py-2",
        xs: "h-6 text-mobile-caption pc:text-xs rounded-md gap-1.5 px-2.5 has-[>svg]:px-2",
        compact:
          "h-7 rounded-md gap-1.5 px-2.5 text-mobile-caption pc:text-xs has-[>svg]:px-2",
        sm: "h-8 rounded-md px-3 text-mobile-caption pc:text-xs",
        lg: "h-10 rounded-md px-8",
        xl: "h-11 rounded-md px-8",
        touch: "h-11 rounded-control-lg px-4 pc:h-9",
        "touch-sm":
          "h-11 rounded-control-lg px-4 text-mobile-caption pc:h-8 pc:px-3 pc:text-xs",
        "touch-compact":
          "h-10 rounded-control px-3 text-[15px] pc:h-7 pc:px-2 pc:text-xs",
        "touch-xs":
          "h-9 rounded-control px-3 text-mobile-caption pc:h-7 pc:px-2 pc:text-xs",
        "dialog-action":
          "h-11 min-h-11 px-4 text-base sm:h-10 sm:min-h-10 sm:px-8 sm:text-sm",
        "dialog-action-compact":
          "h-11 min-h-11 px-2 text-mobile-caption pc:text-xs sm:h-10 sm:min-h-10 sm:px-6 sm:text-sm",
        menu: "h-10 rounded-md px-3",
        composer: "size-8 rounded-full p-0 sm:w-auto sm:px-3",
        "composer-compact": "size-8 rounded-full p-0 sm:w-auto sm:px-2.5",
        "toolbar-color": "h-8 w-14 p-0",
        filter: "h-9 px-2.5 py-1.5 text-mobile-caption sm:h-auto sm:p-1.5",
        icon: "h-9 w-9",
        "icon-xs": "size-6 rounded-xs p-0 has-[>svg]:p-0",
        "icon-compact": "size-7 rounded-md p-0 has-[>svg]:p-0",
        "icon-sm": "size-8 p-0 has-[>svg]:p-0",
        "icon-lg": "size-11 rounded-md p-0 has-[>svg]:p-0",
        "icon-responsive": "size-8 rounded-full p-0 pc:size-6 has-[>svg]:p-0",
        "icon-touch": "size-11 rounded-full p-0 pc:size-8 has-[>svg]:p-0",
        "icon-editor": "size-8 p-0 sm:size-9 has-[>svg]:p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
