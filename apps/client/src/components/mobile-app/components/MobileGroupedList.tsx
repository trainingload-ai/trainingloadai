import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function MobileGroupedList({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", className)}>
      {title ? (
        <h2 className="px-4 text-mobile-caption font-medium text-muted-foreground">
          {title}
        </h2>
      ) : null}
      <div className="overflow-hidden rounded-surface bg-card">
        {children}
      </div>
    </section>
  );
}

function RowContent({
  icon,
  label,
  value,
  detail,
  navigates,
}: {
  icon?: ReactNode;
  label: ReactNode;
  value?: ReactNode;
  detail?: ReactNode;
  navigates?: boolean;
}) {
  return (
    <>
      {icon ? (
        <span
          className="grid size-[18px] shrink-0 place-items-center text-muted-foreground [&_svg]:size-[18px]"
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-mobile-subtitle">{label}</span>
        {detail ? (
          <span className="mt-0.5 block text-mobile-caption text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </span>
      {value ? (
        <span className="max-w-[42%] truncate text-mobile-body text-muted-foreground">
          {value}
        </span>
      ) : null}
      {navigates ? (
        <ChevronRight
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}

const rowClassName =
  "flex min-h-12 w-full items-center gap-3 border-b border-border/60 px-4 py-2 text-left last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

export function MobileNavigationRow({
  href,
  icon,
  label,
  value,
  detail,
}: {
  href: string;
  icon?: ReactNode;
  label: ReactNode;
  value?: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        rowClassName,
        "transition-colors active:bg-neutral-100 dark:active:bg-muted",
      )}
    >
      <RowContent
        icon={icon}
        label={label}
        value={value}
        detail={detail}
        navigates
      />
    </Link>
  );
}

export function MobileInfoRow({
  icon,
  label,
  value,
  detail,
}: {
  icon?: ReactNode;
  label: ReactNode;
  value?: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className={rowClassName}>
      <RowContent icon={icon} label={label} value={value} detail={detail} />
    </div>
  );
}

export function MobileButtonRow({
  icon,
  label,
  value,
  detail,
  onClick,
  disabled,
  destructive = false,
  tall = false,
}: {
  icon?: ReactNode;
  label: ReactNode;
  value?: ReactNode;
  detail?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  tall?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        rowClassName,
        tall && "min-h-[52px]",
        "transition-colors disabled:opacity-55",
        destructive
          ? "justify-center bg-destructive/85 text-white hover:bg-destructive/90 active:bg-destructive/95 dark:bg-destructive/60 dark:hover:bg-destructive/70 dark:active:bg-destructive/75"
          : "active:bg-neutral-100 dark:active:bg-muted",
      )}
    >
      {destructive ? (
        <span className="text-mobile-subtitle font-medium">{label}</span>
      ) : (
        <RowContent
          icon={icon}
          label={label}
          value={value}
          detail={detail}
          navigates
        />
      )}
    </button>
  );
}
