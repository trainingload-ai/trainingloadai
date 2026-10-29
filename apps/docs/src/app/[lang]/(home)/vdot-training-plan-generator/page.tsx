import { notFound } from "next/navigation";

/**
 * The public VDOT plan generator is intentionally retired.
 *
 * Keep the route as an explicit tombstone for now so the legacy generator and
 * authenticated draft-import compatibility can be audited independently from
 * the public page. `notFound()` also prevents this route from being indexed.
 */
export default function VdotPlanGeneratorPage() {
  notFound();
}
