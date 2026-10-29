import { cn } from "@/lib/utils";

export function FullBleedSplit({
  dominant = "left",
  background = "white",
  reverse = false,
  left,
  right,
}: {
  dominant?: "left" | "right" | "equal";
  background?: "white" | "muted";
  reverse?: boolean;
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  const backgroundClassName =
    background === "muted" ? "bg-white dark:bg-card" : "bg-white dark:bg-card";

  const gridClassName =
    dominant === "equal"
      ? "grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center"
      : "grid grid-cols-1 md:grid-cols-10 gap-4 md:gap-8 items-center";

  const leftSpanClassName =
    dominant === "equal"
      ? undefined
      : dominant === "left"
        ? "md:col-span-7"
        : "md:col-span-3";

  const rightSpanClassName =
    dominant === "equal"
      ? undefined
      : dominant === "left"
        ? "md:col-span-3"
        : "md:col-span-7";

  const leftOrderClassName = reverse ? "order-1 md:order-2" : "order-1";
  const rightOrderClassName = reverse ? "order-2 md:order-1" : "order-2";

  return (
    <div className="relative">
      <div
        className={cn(
          "w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw]",
          backgroundClassName,
        )}
      >
        <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
          <div className={gridClassName}>
            <div className={cn(leftOrderClassName, leftSpanClassName)}>
              {left}
            </div>
            <div className={cn(rightOrderClassName, rightSpanClassName)}>
              {right}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
