"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import React, { useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

interface MobileToolbarGroupProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

export const MobileToolbarGroup = ({
  label,
  children,
  className,
}: MobileToolbarGroupProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const closeDrawer = () => setIsOpen(false);

  return (
    <Drawer open={isOpen} onOpenChange={setIsOpen}>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className={cn("w-max gap-1 font-normal", className)}
        >
          {label}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="text-start">{label}</DrawerTitle>
          <DrawerDescription className="sr-only">{label}</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col p-4">
          {React.Children.map(children, (child) =>
            React.isValidElement(child)
              ? React.cloneElement(child, { closeDrawer } as {
                  closeDrawer: () => void;
                })
              : child,
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export const MobileToolbarItem = ({
  children,
  active,
  onClick,
  closeDrawer,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  closeDrawer?: () => void;
}) => (
  <button
    className={cn(
      "flex w-full items-center rounded-md px-4 py-2 text-sm transition-colors hover:bg-neutral-200 dark:hover:bg-muted",
      active && "bg-accent",
    )}
    onClick={(e) => {
      onClick?.(e);
      setTimeout(() => {
        closeDrawer?.();
      }, 100);
    }}
    {...props}
  >
    {children}
  </button>
);
