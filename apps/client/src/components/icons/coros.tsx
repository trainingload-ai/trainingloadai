import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * COROS Personal connection mark: black wordmark in light mode, white in dark.
 * Assets live under `/logo/personal/` so finalize-selfhost-build keeps them.
 */
export function CorosBrandIcon({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-block", className)}>
      <Image
        src="/logo/personal/coros-wordmark-black.png"
        alt=""
        width={320}
        height={81}
        className="block h-full w-auto max-w-full object-contain dark:invisible"
        aria-hidden
      />
      <Image
        src="/logo/personal/coros-wordmark-white.png"
        alt=""
        width={988}
        height={252}
        className="pointer-events-none absolute inset-0 m-auto hidden h-full w-auto max-w-full object-contain dark:block"
        aria-hidden
      />
    </span>
  );
}
