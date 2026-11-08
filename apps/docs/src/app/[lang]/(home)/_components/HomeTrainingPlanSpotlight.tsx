import { TrackedLink } from "@/components/TrackedLink";

export const HOME_RUNNING_PLAN_ROUTES = [
  "/couch-to-5k-training-plan",
  "/5k-training-plan",
  "/10k-training-plan",
  "/half-marathon-training-plan",
  "/marathon-training-plan",
] as const;

export type HomeTrainingPlanSpotlightCopy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  browseAll: string;
  planCta: string;
  freeLabel: string;
  freeTitle: string;
  freeText: string;
  aiLabel: string;
  aiTitle: string;
  aiText: string;
  plans: Array<{
    marker: string;
    title: string;
    meta: string;
  }>;
};

export function HomeTrainingPlanSpotlight({
  copy,
  prefix,
}: {
  copy: HomeTrainingPlanSpotlightCopy;
  prefix: string;
}) {
  const plans = HOME_RUNNING_PLAN_ROUTES.map((href, index) => ({
    ...copy.plans[index],
    href,
  })).filter((plan) => plan.title);

  return (
    <section
      id="free-running-plans"
      aria-labelledby="free-running-plans-title"
      className="home-plans"
    >
      <div className="home-plans-ink">
        <div className="home-container home-plans-head">
          <div>
            <h2 id="free-running-plans-title">{copy.title}</h2>
            <p className="home-lead">{copy.eyebrow}</p>
          </div>
          <div>
            <p className="home-copy">{copy.subtitle}</p>
            <TrackedLink
              href={`${prefix}/plan`}
              eventName="home_plan_hub_click"
              eventProperties={{ placement: "free_plan_spotlight" }}
              className="home-button home-plans-cta"
            >
              {copy.browseAll}
            </TrackedLink>
          </div>
        </div>
      </div>
      <div className="home-container home-plans-body">
        <ol className="home-bento">
          {plans.map((plan, index) => (
            <li key={plan.href}>
              <TrackedLink
                href={`${prefix}${plan.href}`}
                eventName="home_plan_distance_click"
                eventProperties={{
                  placement: "free_plan_spotlight",
                  target: plan.href,
                  position: index + 1,
                }}
                className={index === 0 ? "home-plan home-plan-lead" : "home-plan"}
              >
                <span className="home-plan-marker">{plan.marker}</span>
                <h3>{plan.title}</h3>
                <p>{plan.meta}</p>
                <span className="home-plan-cta">{copy.planCta}</span>
              </TrackedLink>
            </li>
          ))}
        </ol>
        <div className="home-plan-notes">
          <div>
            <p className="home-note-label">{copy.freeLabel}</p>
            <h3>{copy.freeTitle}</h3>
            <p className="home-copy">{copy.freeText}</p>
          </div>
          <div>
            <p className="home-note-label">{copy.aiLabel}</p>
            <h3>{copy.aiTitle}</h3>
            <p className="home-copy">{copy.aiText}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
