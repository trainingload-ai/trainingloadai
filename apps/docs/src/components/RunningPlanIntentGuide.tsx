import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { withLocalePath } from "@/lib/locale-url";
import {
  getPlanIntentGuide,
  goalPaceRows,
  runningPlanIntentContent,
} from "@/lib/running-plan-intents";

export function RunningPlanIntentGuide({
  slug,
  lang,
}: {
  slug: string;
  lang: string;
}) {
  const guide = getPlanIntentGuide(slug, lang);
  if (!guide) return null;
  const { labels } = runningPlanIntentContent(lang);
  const paces = goalPaceRows(slug);

  return (
    <section
      aria-labelledby="next-step-title"
      className="border-y border-neutral-200 bg-white px-5 py-12 text-neutral-950 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50 md:py-16"
    >
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-bold tracking-widest text-emerald-700 dark:text-emerald-300">
          {labels.eyebrow}
        </p>
        <h2
          id="next-step-title"
          className="mt-3 max-w-4xl text-balance text-3xl font-black tracking-tight sm:text-4xl"
        >
          {guide.title}
        </h2>
        <p className="mt-4 max-w-3xl text-pretty leading-7 text-neutral-600 dark:text-neutral-400">
          {guide.intro}
        </p>

        {paces.length > 0 && (
          <div className="mt-8 max-w-3xl">
            <table className="w-full border-y border-neutral-200 text-left text-sm tabular-nums dark:border-neutral-800">
              <caption className="sr-only">{guide.title}</caption>
              <thead className="bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
                <tr>
                  {[labels.goal, labels.perKm, labels.perMile].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="px-3 py-3 font-medium sm:px-5"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {paces.map((row) => (
                  <tr key={row.time}>
                    <th scope="row" className="px-3 py-4 font-bold sm:px-5">
                      {row.time}
                    </th>
                    <td className="px-3 py-4 font-mono sm:px-5">{row.perKm}</td>
                    <td className="px-3 py-4 font-mono sm:px-5">
                      {row.perMile}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs leading-6 text-neutral-500 dark:text-neutral-400">
              {labels.paceNote}
            </p>
            <Link
              href={withLocalePath(lang, "/running-pace-calculator")}
              className="group mt-3 inline-flex items-center gap-2 text-sm font-bold text-emerald-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 dark:text-emerald-300"
            >
              {labels.paceTool}
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
              />
            </Link>
          </div>
        )}

        <div
          className={`mt-8 grid gap-x-10 ${guide.items.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}
        >
          {guide.items.map((item) => (
            <article
              key={item.href}
              className="flex flex-col border-t border-neutral-200 py-5 dark:border-neutral-800"
            >
              <h3 className="text-lg font-bold">{item.title}</h3>
              <p className="mt-3 mb-4 text-sm leading-7 text-neutral-600 dark:text-neutral-400">
                {item.text}
              </p>
              <Link
                href={withLocalePath(lang, item.href)}
                className="group mt-auto inline-flex w-fit items-center gap-2 text-sm font-bold text-emerald-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 dark:text-emerald-300"
              >
                {item.link}
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                />
              </Link>
            </article>
          ))}
        </div>

        {guide.faq.length > 0 && (
          <div className="mt-8 max-w-4xl">
            <h3 className="mb-4 text-xl font-bold">{labels.faq}</h3>
            <div className="divide-y divide-neutral-200 border-y border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {guide.faq.map(([question, answer]) => (
                <details key={question} className="py-4">
                  <summary className="cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-offset-4">
                    {question}
                  </summary>
                  <p className="mt-3 text-sm leading-7 text-neutral-600 dark:text-neutral-400">
                    {answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
