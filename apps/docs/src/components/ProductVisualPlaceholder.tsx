import { Activity, Bot, CalendarDays, LineChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { ZoomableImage } from "@/components/ZoomableImage";

const ASSET_BASE_URL =
  process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? "https://assets.trainingload.ai";

function resolveVisualImageSrc(raw: string | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return value;

  const normalized = value.replace(/^\/+/, "");
  const base = String(ASSET_BASE_URL).trim().replace(/\/+$/, "");

  if (!base) return `${ASSET_BASE_URL}/${normalized}`;

  if (base.endsWith("/assets") && normalized.startsWith("assets/")) {
    return `${base}/${normalized.slice("assets/".length)}`;
  }

  return `${base}/${normalized}`;
}

export function ProductVisualPlaceholder({
  label,
  subtitle,
  imageSrc,
  imageAlt,
  imageAspectRatio,
  showLabelOverlay = true,
  className,
}: {
  label?: string;
  subtitle?: string;
  imageSrc?: string;
  imageAlt?: string;
  imageAspectRatio?: string;
  showLabelOverlay?: boolean;
  className?: string;
}) {
  const title = label ?? "Training workspace";
  const description =
    subtitle ?? "Plan, load, activity feedback, and AI review";
  const resolvedImageSrc = resolveVisualImageSrc(imageSrc);

  return (
    <div
      style={
        resolvedImageSrc && imageAspectRatio
          ? { aspectRatio: imageAspectRatio }
          : undefined
      }
      className={cn(
        "relative overflow-hidden rounded-compact border border-neutral-200 bg-white/80 shadow-xl shadow-neutral-900/5 dark:border-white/10 dark:bg-white/[0.04] dark:shadow-black/20",
        resolvedImageSrc
          ? "aspect-video p-0"
          : "grid min-h-[360px] place-items-center p-5",
        className,
      )}
    >
      {resolvedImageSrc ? (
        <>
          <ZoomableImage
            src={resolvedImageSrc}
            alt={imageAlt ?? title}
            containerClassName="absolute inset-0 h-full w-full rounded-[inherit]"
            className="!m-0 h-full w-full object-contain object-center"
          />
          {showLabelOverlay ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/45 via-black/5 to-transparent">
              <div className="absolute bottom-3 left-3 rounded-compact bg-black/45 px-2 py-1 text-xs font-medium text-white backdrop-blur">
                {title}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.14] dark:opacity-[0.18]"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgba(15,23,42,0.28) 0 1px, transparent 1px), linear-gradient(0deg, rgba(15,23,42,0.18) 0 1px, transparent 1px)",
              backgroundSize: "44px 44px",
            }}
          />
          <div className="relative w-full max-w-md text-left">
            <div className="rounded-compact border border-neutral-200 bg-card p-4 shadow-sm dark:border-white/10 dark:bg-card/70">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                    Trainingload.ai
                  </div>
                  <div className="mt-2 text-lg font-black text-neutral-950 dark:text-white">
                    {title}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {description}
                  </p>
                </div>
                <div className="grid size-10 shrink-0 place-items-center rounded-compact bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300">
                  <Bot className="size-5" />
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  {
                    label: "Plan",
                    value: "4 week block",
                    icon: CalendarDays,
                  },
                  {
                    label: "Load",
                    value: "steady build",
                    icon: LineChart,
                  },
                  {
                    label: "Activity",
                    value: "matched",
                    icon: Activity,
                  },
                  {
                    label: "AI review",
                    value: "ready",
                    icon: Bot,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="rounded-compact border border-neutral-200 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.04]"
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                        <Icon className="size-3.5 text-emerald-600 dark:text-emerald-300" />
                        {item.label}
                      </div>
                      <div className="mt-2 text-sm font-black text-neutral-950 dark:text-white">
                        {item.value}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 overflow-hidden rounded-compact border border-neutral-200 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex h-24 items-end gap-2">
                  {[32, 48, 42, 58, 52, 68, 61, 74, 66, 72, 60, 64].map(
                    (height, index) => (
                      <div
                        key={`${height}-${index}`}
                        className="flex-1 rounded-t bg-emerald-500/70 dark:bg-emerald-400/70"
                        style={{ height: `${height}%` }}
                      />
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
