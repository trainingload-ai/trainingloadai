import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Garmin Personal connection badge: white wordmark on Garmin blue.
 * Matches the managed Third-Party card look without using stripped
 * managedPublicAssets paths (`logo/garmin.svg`, `logo/garmin_white.png`).
 */
export function GarminBrandIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/logo/personal/garmin-wordmark-white.png"
      alt=""
      width={693}
      height={120}
      className={cn("block shrink-0 object-contain", className)}
      aria-hidden
    />
  );
}
