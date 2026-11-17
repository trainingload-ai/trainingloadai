"use client";

import { useTranslations } from "next-intl";
import type { WorkoutMatchingReview } from "@shared/workout-matching";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";

/** Coach reminders present unresolved facts without changing training history. */
export function WorkoutMatchingReviews({
  reviews,
}: {
  reviews: WorkoutMatchingReview[];
}) {
  const t = useTranslations("V2HomePage.workoutMatching");
  return reviews.map((review) => (
    <article
      key={review.id}
      className="space-y-2 rounded-lg border bg-card p-4 text-card-foreground"
    >
      <h3 className="text-sm font-semibold">{t("title")}</h3>
      <p className="text-sm">{review.activityTitle || review.date}</p>
      <p className="text-sm text-muted-foreground">
        {t(
          review.reason === "INSUFFICIENT_EVIDENCE"
            ? "insufficient"
            : "ambiguous",
        )}
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {review.candidates.map((candidate) => (
          <li key={candidate.workoutId}>
            {candidate.name || t("workout")}
            {candidate.planTitle ? ` · ${candidate.planTitle}` : ""}
          </li>
        ))}
      </ul>
      <Link
        href={`/activities/${encodeURIComponent(review.activityHashId)}`}
        className={buttonVariants({ variant: "outline", size: "sm" })}
        aria-label={t("manualLabel", {
          activity: review.activityTitle || review.date,
        })}
      >
        {t("manual")}
      </Link>
    </article>
  ));
}
