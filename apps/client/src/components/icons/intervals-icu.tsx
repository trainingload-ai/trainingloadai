import Image from "next/image";
import { cn } from "@/lib/utils";

export function IntervalsIcuBrandIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/logo/intervals-logo-round.svg"
      alt=""
      width={163}
      height={163}
      className={cn("block shrink-0 object-contain", className)}
      aria-hidden
    />
  );
}
