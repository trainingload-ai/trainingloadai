import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-md bg-neutral-100 dark:bg-muted/45",
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
