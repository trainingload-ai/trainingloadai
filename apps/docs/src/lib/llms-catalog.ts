import { SEO_INDEXED_LANGUAGES } from "@/lib/i18n";
import { localePrefix } from "@/lib/locale-url";

export type LlmToolPage = {
  title: string;
  path: string;
  description: string;
};

export const llmProductPages: LlmToolPage[] = [
  {
    title: "TrainingLoad MCP",
    path: "/features/mcp",
    description:
      "Connect ChatGPT, Codex, Claude, Cursor, VS Code, or opencode to 17 read-only TrainingLoad tools with OAuth, bounded queries, and transparent evidence.",
  },
  {
    title: "Trainingload.ai Product Overview",
    path: "/features",
    description:
      "Understand the Trainingload.ai product: plans, calendar, completed workouts, training load, AI coach review, and confirmable workout adjustments.",
  },
  {
    title: "Training Load Management",
    path: "/training-load",
    description:
      "Learn how Trainingload.ai turns CTL, ATL, TSB, and real workout feedback into better adaptive endurance plan decisions.",
  },
  {
    title: "Training Analysis",
    path: "/training-analysis",
    description:
      "Review plan-vs-actual execution, load response, readiness, and next-step training adjustments in one evidence-based workflow.",
  },
  {
    title: "Adaptive Training Plans",
    path: "/ai-training-plan",
    description:
      "Build an AI training plan that reads completed workouts and training load, then drafts confirmable adjustments instead of staying fixed.",
  },
  {
    title: "AI Marathon Training Plan",
    path: "/ai-marathon-training-plan",
    description:
      "Use AI marathon planning to review completed long runs, training load, and taper decisions, then confirm adjustments before they reach the calendar.",
  },
  {
    title: "AI Half Marathon Training Plan",
    path: "/ai-half-marathon-training-plan",
    description:
      "Use AI half marathon planning to review completed long runs, training load, and two-week taper decisions, then confirm adjustments before they reach the calendar.",
  },
  {
    title: "AI Endurance Coach",
    path: "/ai-coach",
    description:
      "Browse AI coach pages for endurance athletes, including running and cycling coach workflows tied to plans, workouts, and training load.",
  },
  {
    title: "AI Running Coach",
    path: "/ai-coach/running-coach",
    description:
      "Use Trainingload.ai as an AI running coach for plan execution, completed run review, load management, and confirmable workout adjustments.",
  },
  {
    title: "AI Cycling Coach",
    path: "/ai-coach/cycling-coach",
    description:
      "Use Trainingload.ai as an AI cycling coach for FTP and power-zone context, ride review, training load, and plan adjustments.",
  },
  {
    title: "Training Plan Collection",
    path: "/plan",
    description:
      "Browse reviewed official 5K templates plus 10K, half-marathon, and marathon planning workflows that can connect to AI Coach review.",
  },
  {
    title: "RPE Scale for Running",
    path: "/rpe-scale",
    description:
      "Understand the 1–10 rating of perceived exertion scale, talk-test cues, RPE use in official 5K plans, and the differences between workout RPE, session RPE, pace, and heart rate.",
  },
  {
    title: "Couch to 5K Training Plan",
    path: "/couch-to-5k-training-plan",
    description:
      "Follow a complete nine-week couch-to-5K run-walk schedule, then personalize it around available days, completed runs, and reviewable adjustments.",
  },
  {
    title: "8-Week 5K Training Plan",
    path: "/5k-training-plan",
    description:
      "Follow a complete eight-week 5K schedule with easy running, controlled quality sessions, a weekly long run, taper, and AI-assisted personalization.",
  },
  {
    title: "Intermediate 5K Training Plan",
    path: "/5k-training-plan/intermediate",
    description:
      "Follow a complete eight-week intermediate 5K schedule with easy runs, intervals, tempo work, long runs, recovery spacing, and optional VDOT pace anchors.",
  },
  {
    title: "10K Training Plan | Free 10-Week Beginner Schedule",
    path: "/10k-training-plan",
    description:
      "Follow a free 10-week beginner 10K training plan with three runs a week, a 65-minute peak long run, three controlled steady sessions, and a two-week taper. There is no separate AI 10K URL.",
  },
  {
    title: "Half Marathon Training Plan: Free 14-Week Beginner Schedule",
    path: "/half-marathon-training-plan",
    description:
      "Follow a free 14-week beginner half marathon training plan with a week-by-week schedule, four runs a week, a 110-minute peak long run, and a two-week taper. AI modifiers stay on the AI half marathon URL.",
  },
  {
    title: "Marathon Training Plan | Free 18-Week Beginner Schedule",
    path: "/marathon-training-plan",
    description:
      "Follow a free 18-week beginner marathon training plan with four runs a week, a 165-minute peak long run, three absorption weeks, and a three-week taper. AI modifiers stay on the AI marathon URL.",
  },
  {
    title: "Cycling Training Plan",
    path: "/cycling-training-plan",
    description:
      "Load-based cycling training plan hub for gran fondo and century goals. Official week-by-day templates are running-only; this page is a 12–16 week framework plus FTP, TSS, and confirmable AI—not a fake bike template export.",
  },
  {
    title: "IRONMAN 70.3 Training Plan",
    path: "/ironman-70-3-training-plan",
    description:
      "IRONMAN 70.3 / 113 training plan hub across swim, bike, and run. There is no official 70.3 template JSON; use the phase framework, combined training load, and confirmable AI adjustments.",
  },
  {
    title: "PMC Fitness Chart",
    path: "/features/pmc-fitness-chart",
    description:
      "Use PMC, CTL, ATL, and TSB to decide when to build training load, hold steady, or recover before the next key session.",
  },
  {
    title: "Power Curve",
    path: "/features/power-curve",
    description:
      "Analyze power-duration performance, connect it to CP and FTP estimates, and identify which endurance limiter to train next.",
  },
  {
    title: "Power Rankings",
    path: "/features/power-rankings",
    description:
      "Compare best efforts by duration to identify strengths, weaknesses, and block-to-block performance changes.",
  },
  {
    title: "Custom Zones",
    path: "/features/custom-zones",
    description:
      "Set custom power, heart-rate, and pace zones when default models do not match field tests, physiology, or block goals.",
  },
  {
    title: "CP, FTP, and LTHR Estimator",
    path: "/features/cp-ftp-lthr-estimator",
    description:
      "Estimate threshold anchors and apply them to zones, workout targets, and training-load planning.",
  },
  {
    title: "effective VO2max Trend",
    path: "/features/effective-vo2max-trend",
    description:
      "Read effective VO2max trends together with load, recovery, and workout execution before changing plan intensity.",
  },
  {
    title: "Best Efforts",
    path: "/features/best-efforts",
    description:
      "Review best efforts across durations and connect peak performances to training blocks, fatigue, and progression checks.",
  },
  {
    title: "Fitness, Fatigue, and Form",
    path: "/features/fitness-fatigue-form",
    description:
      "Translate Fitness, Fatigue, and Form signals into weekly training-load decisions using CTL, ATL, and TSB context.",
  },
  {
    title: "Pricing",
    path: "/pricing",
    description:
      "Compare Free, PLUS, and PRO monthly AI credits, credit packs, Standard and Deep mode multipliers, and monthly or yearly billing.",
  },
  {
    title: "Best training load app alternatives",
    path: "/alternatives",
    description:
      "Compare TrainingPeaks, Intervals.icu, Runalyze, and FormBeat alternatives. Trainingload.ai is a training load app that turns completed workouts into AI-reviewed plan adjustments.",
  },
];

export const llmGuidePages: LlmToolPage[] = [
  {
    title: "Self-hosting",
    path: "/api/docs-markdown/en/self-host",
    description:
      "Choose, install, configure, back up, and troubleshoot a signed Trainingload.ai self-host instance.",
  },
  {
    title: "Self-hosted vs Cloud",
    path: "/api/docs-markdown/en/self-host/self-host-vs-cloud",
    description:
      "Compare operational responsibility, data location, local file storage, BYOK AI, integrations, backups, and availability.",
  },
  {
    title: "Self-host Quick Start",
    path: "/api/docs-markdown/en/self-host/installation",
    description:
      "Verify and install an exact signed release bundle, claim the local owner, check readiness, and create the first backup.",
  },
  {
    title: "Product Tour",
    path: "/api/docs-markdown/en/guide/product-tour",
    description:
      "Understand how profile data, activities, calendar, plans, analysis, competitions, AI Coach, connections, and mobile recording fit together.",
  },
  {
    title: "Choose Your Training Workflow",
    path: "/api/docs-markdown/en/guide/choose-your-path",
    description:
      "Choose the shortest setup path for recent-training analysis, plan execution, mobile recording, AI assistance, or strength workouts.",
  },
  {
    title: "Create a Training Plan",
    path: "/api/docs-markdown/en/guide/create-training-plan",
    description:
      "Compare reviewed official templates, manual plans, and AI-assisted plan drafts, including preview, activation, and expected-load behavior.",
  },
  {
    title: "Plan Lifecycle, Sharing, and Import",
    path: "/api/docs-markdown/en/planning/plan-lifecycle",
    description:
      "Understand plan states, unlisted version-aware sharing, shared-plan draft imports, VDOT-generated imports, revocation, and activation safeguards.",
  },
  {
    title: "Web and Mobile",
    path: "/api/docs-markdown/en/guide/web-and-mobile",
    description:
      "Understand shared account data, synchronization, mobile recording, plan execution, and when to use each product surface.",
  },
  {
    title: "Today and Current Status",
    path: "/api/docs-markdown/en/guide/today-and-current-state",
    description:
      "Use current plan, completed-workout, training-load, and athlete-state context to decide what needs attention today.",
  },
  {
    title: "Connect Third-Party Platforms",
    path: "/api/docs-markdown/en/guide/connect-third-party-platforms",
    description:
      "Connect Strava, Polar, COROS, Intervals.icu, Suunto, and Wahoo, or import Garmin history, with explicit synchronization directions.",
  },
  {
    title: "AI Coach",
    path: "/api/docs-markdown/en/guide/ai-coach",
    description:
      "Use account context for training questions, structured plan drafts, reviews, and confirmable workout adjustments.",
  },
  {
    title: "Training Analysis Workflow",
    path: "/api/docs-markdown/en/guide/training-analysis-workflow",
    description:
      "Review plan-versus-actual execution, load response, performance trends, and the next evidence-based training decision.",
  },
  {
    title: "TrainingPeaks Alternative for Training Load",
    path: "/api/docs-markdown/en/guide/trainingpeaks-alternative-for-training-load",
    description:
      "Honest TrainingPeaks alternative for athletes who want PMC-style training load plus an AI coach that adjusts the plan from completed workouts.",
  },
  {
    title: "Intervals.icu Alternative for Training Load",
    path: "/api/docs-markdown/en/guide/intervals-icu-alternative-for-training-load",
    description:
      "Honest Intervals.icu alternative for athletes who want free PMC-style analysis plus confirmed weekly plan adjustments.",
  },
  {
    title: "Runalyze Alternative for Training Load",
    path: "/api/docs-markdown/en/guide/runalyze-alternative-for-training-load",
    description:
      "Honest Runalyze alternative for athletes who want endurance analysis next to plan vs completed and confirmable AI drafts.",
  },
  {
    title: "FormBeat Alternative for Training Load",
    path: "/api/docs-markdown/en/guide/formbeat-alternative-for-training-load",
    description:
      "Honest FormBeat alternative for athletes who want cycling-style fitness, fatigue, and form inside a multi-sport plan loop.",
  },
  {
    title: "Account, Permissions, Exports, and AI Usage",
    path: "/api/docs-markdown/en/guide/account-permissions-and-usage",
    description:
      "Review identity, connections, permissions, data exports, account deletion, automatic metric updates, membership source, AI credit balance, and usage history.",
  },
  {
    title: "Mobile Recording",
    path: "/api/docs-markdown/en/guide/mobile-recording",
    description:
      "Prepare permissions, record safely, recover an interrupted session, upload it, and verify synchronization.",
  },
];

export const llmFreeToolPages: LlmToolPage[] = [
  {
    title: "Free AI Workout Review",
    path: "/free-ai-workout-review",
    description:
      "Upload one FIT, GPX, or TCX activity for a structured AI workout review with evidence, recovery guidance, and an origin-free Three.js route. No account or API key is required; the file and result are not persisted.",
  },
  {
    title: "Workout Editor & Builder",
    path: "/workout-editor",
    description:
      "Browser workout editor and structured workout builder for endurance sessions. Add sport, steps, and interval repeats, preview the session, then download a Garmin workout FIT, copy intervals.icu workout_doc JSON, or copy Trainingload Workout DSL. Saving to a plan happens in the Trainingload app.",
  },
  {
    title: "FIT File Viewer",
    path: "/fit-file-viewer",
    description:
      "Open Garmin FIT files entirely in the browser to inspect file identity, activity summaries, CRC integrity, developer fields, and decoded FIT messages. Files are never uploaded; JSON and per-message CSV exports are generated locally.",
  },
  {
    title: "FTP Calculator",
    path: "/ftp-calculator",
    description:
      "Free FTP calculator: estimate cycling FTP from a 20-minute, ramp, 2×8, or 60-minute field test, or an optional GPX, FIT, or TCX ride. Includes W/kg and Coggan zones.",
  },
  {
    title: "CSS Calculator",
    path: "/css-calculator",
    description:
      "Critical swim speed calculator: CSS pace and swim training zones from two timed swims (200 and 400), in meters or yards.",
  },
  {
    title: "Critical Power Calculator",
    path: "/critical-power-calculator",
    description:
      "Calculate critical power and W′ from two or three maximal efforts, with W/kg, model fit, 5-, 8- and 20-minute power predictions, and a clear CP-versus-FTP explanation.",
  },
  {
    title: "Lactate Threshold Calculator",
    path: "/lactate-threshold-calculator",
    description:
      "Estimate LT1 and LT2 from a race or field test, including lactate-threshold pace, LTHR and threshold power, with method limits and handoffs to training zones.",
  },
  {
    title: "VDOT Calculator",
    path: "/vdot-calculator",
    description:
      "Calculate VDOT from a recent race or local activity file, then generate Daniels-style E, M, T, I and R training paces and equivalent race times while keeping VDOT distinct from measured VO2max.",
  },
  {
    title: "Running Pace Calculator",
    path: "/running-pace-calculator",
    description:
      "Calculate running pace, time, or distance; convert min/km, min/mile, km/h, and mph; and use goal-time pace charts and even splits for 5K, 10K, half marathon, and marathon. Times at the same pace are arithmetic conversions, not fitness-based race predictions. Includes formulas, examples, and print/share results.",
  },
  {
    title: "Race Time Predictor",
    path: "/race-time-predictor",
    description:
      "Estimate equivalent 5K, 10K, half marathon, and marathon times with Daniels VDOT from a recent race, known pace, or local GPX, FIT, or TCX file. Includes pace per km/mile, example tables, marathon assumptions, and model comparisons. Files stay in the browser; equivalents assume preparation for each distance.",
  },
  {
    title: "Daniels' Running Formula and VDOT Guide",
    path: "/daniels-running-formula",
    description:
      "Learn how VDOT and E/M/T/I/R training intensities inform running plans, with clear methodology attribution and an explicit non-affiliation disclosure.",
  },
  {
    title: "VO2 Max Calculator",
    path: "/vo2-max-calculator",
    description:
      "Estimate VO2 max from distance, time, pace, resting heart rate, or fitness data.",
  },
  {
    title: "Cycling Power Zone Calculator",
    path: "/power-zones-calculator",
    description:
      "Calculate continuous whole-watt Coggan cycling power zones from FTP, compare Friel, review common workout targets, and use separately labeled Vance or Stryd running-power models when a plan calls for them.",
  },
  {
    title: "Heart Rate Zones Calculator",
    path: "/heart-rate-zones-calculator",
    description:
      "Build a complete non-overlapping heart-rate training table with Karvonen HRR or max-HR five-zone models, or the Friel LTHR seven-zone model. Outputs every zone's bpm range, percent band, purpose, and feel; use the separate Zone 2 calculator when only one aerobic range is needed.",
  },
  {
    title: "TSS Calculator and Training Stress Score Guide",
    path: "/tss-calculator",
    description:
      "Calculate cycling Training Stress Score and Intensity Factor from duration, Normalized Power or average power, and FTP. Includes the power TSS formula, worked examples, differences between TSS, rTSS, sTSS, and hrTSS, interpretation limits, and links into CTL, ATL, TSB, and the in-app PMC.",
  },
  {
    title: "Training Load Calculator",
    path: "/training-load-calculator",
    description:
      "Project CTL, ATL, and TSB from starting fitness/fatigue and a short table of daily TSS using a TrainingPeaks-style EWMA. Teaching demo of the Performance Management Chart, not the full synced PMC.",
  },
  {
    title: "Max Heart Rate Calculator",
    path: "/max-heart-rate-calculator",
    description:
      "Estimate HRmax by age with Fox, Tanaka, Gulati, HUNT/Nes, or Arena; compare a measured test or observed activity peak; and understand uncertainty before opening full training zones.",
  },
  {
    title: "Zone 2 Heart Rate Calculator",
    path: "/zone-2-heart-rate-calculator",
    description:
      "Calculate one aerobic Zone 2 bpm range from measured max HR, Karvonen heart-rate reserve, Friel LTHR, or age-predicted HRmax. Includes method comparison, a Tanaka age table, talk-test guidance, and an explicit handoff to the complete five- or seven-zone calculator.",
  },
  {
    title: "Brick Workout",
    path: "/brick-workout",
    description:
      "Educational triathlon brick workout hub: bike-to-run formats, combined load and fatigue notes, and CTAs into Olympic/70.3 plan hubs and the workout editor. Not a fake session library.",
  },
  {
    title: "Olympic Triathlon Training Plan",
    path: "/olympic-triathlon-training-plan",
    description:
      "Olympic-distance triathlon planning hub for 1.5 km / 40 km / 10 km. Phase framework, weekly structure, bricks, CSS/FTP context, and confirmable AI load adjustments—not an official day-by-day template.",
  },
  {
    title: "Swim Training Plan",
    path: "/swim-training-plan",
    description:
      "Load-based swim training plan hub for aerobic base, technique, CSS sets, and race prep. Official week-by-day templates are running-only; this page is a framework plus CSS and confirmable AI—not a fake 12-week spreadsheet.",
  },
  {
    title: "GPX FIT TCX Converter",
    path: "/converter",
    description:
      "Free online hub to convert endurance activity files between GPX, FIT, and TCX. One file at a time, up to 16 MB.",
  },
  {
    title: "FIT to GPX Converter",
    path: "/fit-to-gpx",
    description:
      "Free online FIT to GPX converter (file converter). Upload one Garmin FIT activity file, convert to GPX, and download.",
  },
  {
    title: "GPX to FIT Converter",
    path: "/gpx-to-fit",
    description:
      "Free online GPX to FIT converter (file converter). Upload one GPX activity file, convert to Garmin FIT, and download.",
  },
  {
    title: "TCX to GPX Converter",
    path: "/tcx-to-gpx",
    description:
      "Free online TCX to GPX converter (file converter). Upload one TCX activity file, convert to GPX, and download.",
  },
  {
    title: "GPX to TCX Converter",
    path: "/gpx-to-tcx",
    description:
      "Free online GPX to TCX converter (file converter). Upload one GPX activity file, convert to Garmin TCX, and download.",
  },
  {
    title: "FIT to TCX Converter",
    path: "/fit-to-tcx",
    description:
      "Free online FIT to TCX converter (file converter). Upload one Garmin FIT activity file, convert to TCX, and download.",
  },
  {
    title: "TCX to FIT Converter",
    path: "/tcx-to-fit",
    description:
      "Free online TCX to FIT converter (file converter). Upload one TCX activity file, convert to Garmin FIT, and download. Preserve GPS, heart rate, and laps.",
  },
  {
    title: "FIT Course Converter",
    path: "/fit-course-converter",
    description:
      "Convert GPX or TCX route/course files into Garmin-compatible FIT course files.",
  },
];

export const llmToolPages: LlmToolPage[] = [
  ...llmProductPages,
  ...llmFreeToolPages,
];

export function localizedPageUrls(siteUrl: string, path: string) {
  const base = siteUrl.replace(/\/+$/, "");
  return SEO_INDEXED_LANGUAGES.map((lang) => {
    const prefix = localePrefix(lang);
    return { lang, url: `${base}${prefix}${path}` };
  });
}
