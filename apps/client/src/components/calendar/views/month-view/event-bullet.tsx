import { cva } from "class-variance-authority";
import { motion } from "framer-motion";

import type { TEventColor } from "@/components/calendar/types";
import { cn } from "@/lib/utils";

const eventBulletVariants = cva("size-2 rounded-full", {
  variants: {
    color: {
      blue: "bg-blue-600 dark:bg-blue-500",
      green: "bg-emerald-600 dark:bg-emerald-500",
      red: "bg-red-600 dark:bg-red-500",
      yellow: "bg-yellow-600 dark:bg-yellow-500",
      purple: "bg-purple-600 dark:bg-purple-500",
      orange: "bg-orange-600 dark:bg-orange-500",
      gray: "bg-gray-600 dark:bg-gray-500",
    },
  },
  defaultVariants: {
    color: "blue",
  },
});

export function EventBullet({
  color,
  className,
}: {
  color: TEventColor;
  className?: string;
}) {
  return (
    <motion.div
      className={cn(eventBulletVariants({ color, className }))}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.2 }}
      transition={{
        type: "spring",
        stiffness: 100,
        damping: 10,
      }}
    />
  );
}
