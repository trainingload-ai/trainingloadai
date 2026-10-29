import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type ProductBrowserChromeProps = {
  address: string;
  addressAriaLabel?: string;
  addressHref?: string;
  center?: ReactNode;
  right?: ReactNode;
  compact?: boolean;
  variant?: "adaptive" | "dark";
  className?: string;
};

export function ProductBrowserChrome({
  address,
  addressAriaLabel,
  addressHref,
  center,
  right,
  compact = false,
  variant = "adaptive",
  className,
}: ProductBrowserChromeProps) {
  const dark = variant === "dark";

  return (
    <div
      className={cn(
        "grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b px-3 sm:px-4",
        compact ? "h-9" : "h-10",
        dark
          ? "border-white/10 bg-neutral-950"
          : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950",
        className,
      )}
    >
      <div className="group/lights flex gap-1.5" aria-hidden="true">
        <span className="flex size-2.5 items-center justify-center rounded-full bg-[#ff5f57]">
          <svg
            viewBox="0 0 8 8"
            className="size-1.5 opacity-0 transition-opacity duration-150 group-hover/lights:opacity-100 motion-reduce:transition-none"
          >
            <path
              d="M2.2 2.2l3.6 3.6M5.8 2.2L2.2 5.8"
              stroke="#8c1a10"
              strokeWidth="1.1"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="flex size-2.5 items-center justify-center rounded-full bg-[#febc2e]">
          <svg
            viewBox="0 0 8 8"
            className="size-1.5 opacity-0 transition-opacity duration-150 group-hover/lights:opacity-100 motion-reduce:transition-none"
          >
            <path
              d="M1.6 4h4.8"
              stroke="#99590c"
              strokeWidth="1.1"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="flex size-2.5 items-center justify-center rounded-full bg-[#28c840]">
          <svg
            viewBox="0 0 8 8"
            className="size-1.5 opacity-0 transition-opacity duration-150 group-hover/lights:opacity-100 motion-reduce:transition-none"
          >
            <path
              d="M4 1.6v4.8M1.6 4h4.8"
              stroke="#0d5f14"
              strokeWidth="1.1"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </div>

      <div
        className={cn(
          "min-w-0 max-w-[56vw] truncate rounded-compact border px-2.5 py-0.5 font-mono text-[11px] transition-colors focus-within:ring-2 focus-within:ring-emerald-500 sm:text-xs",
          dark
            ? "border-white/10 bg-neutral-900 text-neutral-400 hover:border-white/20 hover:text-white"
            : "border-neutral-200 bg-neutral-50 text-neutral-500 hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-700 dark:hover:text-white",
          addressHref && "cursor-pointer",
        )}
        title={address}
      >
        {center ??
          (addressHref ? (
            <a
              href={addressHref}
              target={/^https?:\/\//.test(addressHref) ? "_blank" : undefined}
              rel={
                /^https?:\/\//.test(addressHref)
                  ? "noopener noreferrer"
                  : undefined
              }
              aria-label={addressAriaLabel ?? address}
              className="block truncate focus-visible:outline-none"
            >
              {address}
            </a>
          ) : (
            address
          ))}
      </div>

      <div className="min-w-0 justify-self-end">{right}</div>
    </div>
  );
}

export function ProductBrowserWindow({
  address,
  addressAriaLabel,
  addressHref,
  children,
  center,
  className,
  chromeClassName,
  contentClassName,
  compact = false,
  variant = "adaptive",
  right,
}: ProductBrowserChromeProps & {
  children: ReactNode;
  chromeClassName?: string;
  contentClassName?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-feature border",
        variant === "dark"
          ? "border-white/15 bg-neutral-950"
          : "border-neutral-300 bg-white dark:border-white/15 dark:bg-neutral-950",
        className,
      )}
    >
      <ProductBrowserChrome
        address={address}
        addressAriaLabel={addressAriaLabel}
        addressHref={addressHref}
        center={center}
        compact={compact}
        variant={variant}
        right={right}
        className={chromeClassName}
      />
      <div className={cn("min-h-0 flex-1", contentClassName)}>{children}</div>
    </div>
  );
}
