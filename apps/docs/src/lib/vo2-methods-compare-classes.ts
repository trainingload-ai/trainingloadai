/**
 * Shared Tailwind classes for the VO2 Max “methods comparison” table.
 * Used by MDX docs (must be Tailwind-scan-friendly) and the estimate tool page.
 */
export const VO2_METHODS_COMPARE_SHELL = [
  "not-prose overflow-x-auto rounded-compact",
  "border border-slate-300/50 bg-white/70",
  "shadow-[0_8px_24px_rgba(15,23,42,0.06)]",
  "dark:border-slate-600/30 dark:bg-slate-950/60 dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)]",
  // Inner <table> (fumadocs MDX wraps it in an extra div — keep [&_table] selectors)
  "[&_table]:w-full [&_table]:table-fixed [&_table]:border-separate [&_table]:border-spacing-0",
  "[&_table]:overflow-hidden [&_table]:rounded-compact",
  "[&_table]:border [&_table]:border-slate-300/50 dark:[&_table]:border-slate-600/30",
  "[&_thead]:bg-gradient-to-r [&_thead]:from-emerald-500/15 [&_thead]:to-blue-500/12",
  "dark:[&_thead]:from-emerald-500/25 dark:[&_thead]:to-blue-500/18",
  "[&_th]:p-3 [&_th]:text-left [&_th]:text-sm [&_th]:font-bold",
  "[&_th]:border-b [&_th]:border-slate-300/50 [&_th]:text-slate-900",
  "dark:[&_th]:border-slate-600/30 dark:[&_th]:text-slate-50",
  "[&_td]:p-3 [&_td]:align-top [&_td]:text-sm [&_td]:text-slate-700 dark:[&_td]:text-slate-200",
  "[&_tr.vo2-mt-row-a]:bg-emerald-500/10 dark:[&_tr.vo2-mt-row-a]:bg-emerald-500/15",
  "[&_tr.vo2-mt-row-b]:bg-blue-500/10 dark:[&_tr.vo2-mt-row-b]:bg-blue-500/15",
  "[&_tr.vo2-mt-row-n]:bg-white/65 dark:[&_tr.vo2-mt-row-n]:bg-slate-800/50",
].join(" ");

export const VO2_MT_STRONG_EM =
  "font-semibold text-emerald-600 dark:text-emerald-400";

export const VO2_MT_STRONG_BL = "font-semibold text-blue-600 dark:text-sky-400";
