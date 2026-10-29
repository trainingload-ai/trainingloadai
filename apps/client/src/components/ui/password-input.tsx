"use client";
import * as React from "react";

import { cn } from "@/lib/utils";
import { inputVariants, type InputProps } from "@/components/ui/input";
import { EyeClosedIcon, EyeOpenIcon } from "@radix-ui/react-icons";

const PasswordInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, size, type: _type, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);
    const togglePasswordVisibility = () => setShowPassword(!showPassword);

    return (
      <div className="relative">
        <input
          type={showPassword ? "text" : "password"}
          className={cn(inputVariants({ size, className }), "pr-10")}
          ref={ref}
          {...props}
        />
        <button
          type="button"
          aria-label={showPassword ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={togglePasswordVisibility}
        >
          {showPassword ? (
            <EyeOpenIcon className="size-4" />
          ) : (
            <EyeClosedIcon className="size-4" />
          )}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
