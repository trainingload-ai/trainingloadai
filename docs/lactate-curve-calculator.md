# Public lactate curve calculator

The unauthenticated `/lactate-curve-calculator` analyzes measured cycling/running
step-test samples entirely in the browser. It does not save tests, call an
anonymous calculation API, prescribe training, or update account thresholds.
The separate `/lactate-threshold-calculator` retains race/field-test estimates.

## Implementation and numerical contract

- Public package export: `@trainingloadai/shared/lactate-analysis`.
- Engine `1.0.0`, schema `1`; source lactater commit
  `2cd3709f6442447b3b9128e325f13fa38570eb17` (package version 1.0.0).
- Eight methods: OBLA 2/4, baseline +0.5/+1, Log-log, Dmax, ModDmax,
  Log-Poly-ModDmax. No extrapolation or silent method fallback.
- Default LT1/LT2: baseline +0.5 / Log-Poly-ModDmax. Three zones require two
  available estimates with LT1 < LT2. Unavailable methods retain stable reasons.
- Finite, increasing and distinct intensity; positive lactate/optional HR;
  4–30 exercise stages plus optional rest at intensity 0. Six to ten is preferable.
  Running uses km/h internally; min/km and min/mile are input representations.
- Rest sets baseline and is excluded from cubic/Log-log fits. The cubic uses
  normalized QR; crossings and Dmax candidates are solved analytically with
  bisection for polynomial roots. ModDmax uses a tolerant >=0.4 comparison.
- `complete`, `partial` and `unavailable` distinguish applicability from runtime
  exceptions. Heart rate only interpolates across adjacent complete HR samples.
- Fit diagnostics expose per-stage measured/fitted/residual values, RMSE,
  maximum absolute residual and R² (null for zero variance). These describe
  agreement with samples, not uncertainty or physiological validity.

See [reference reproduction](../scripts/lactate-reference/README.md) for pinned
WebR 0.5.4 / R 4.5.1, archive checksums, tolerances, edge policies and MIT notice.
Regular tests and production do not depend on R or WebR.

## UI, report and content

Hand entry, quoted CSV/BOM/TSV paste, explicit column confirmation, active
example loading and unit conversion share one validated input. CSV is limited
to 256 KiB, 100 text lines and 16 columns. Incorrect rows are not silently dropped.
Changing any input/protocol setting invalidates the old result immediately;
exports and zones remain unavailable until recalculation. Repeated submission
of an unchanged analyzed revision is ignored.

Input and report are separate views. Calculation opens a full-width report;
editing retains the dataset and invalidates the previous analysis. Reading order:
the two selected thresholds, the curve/HR view explaining their positions,
method differences, then zone selection and export. The last tested intensity is
secondary context. The main curve shows exercise samples and domain boundaries;
the optional resting sample is used for baseline, not plotted as an exercise stage.
Dmax anchors/distance and the logarithmic Log-log construction open in a focused
method dialog. The method comparison uses one shared intensity axis. Markers
represent method estimates, not a confidence interval. Residual inspection is
optional. Missing HR is not filled in. Zone HR endpoints are references at the
selected thresholds, not a separately validated HR-zone model.

The initial illustrative preview uses the same lactate/HR chart and default
threshold pair as an analyzed report. It does not populate the input or emit
calculation events until the visitor explicitly loads and analyzes the example.
Pointer inspection, touch pinning and keyboard stage navigation expose measured
and fitted lactate, heart rate, residual and intensity domain. The main and HR
plots share an intensity crosshair. The product section connects test findings
to longitudinal training-load/recovery analysis with actual localized product
screenshots and the existing cross-site signup attribution.

CSV and print retain input, excluded last-stage values, optional protocol,
methods, chosen pair, engine and reference commit. CSV also records status,
warnings and zone boundaries. Downloads are local Blobs. Print events mean the
dialog was requested, not that a PDF was saved.
Print uses fixed-view-box SVGs for the full measured intensity range rather than
depending on responsive chart measurements during the browser's print layout.

English, Simplified Chinese, Traditional Chinese and Japanese have complete
route copy, canonical/hreflang, metadata and structured data. Secondary locales
use the site's existing English fallback/noindex policy. The route is included
in sitemap, tools catalog and LLM catalog; physiology docs and the estimation
tool link to it. The OG illustration is labeled as illustrative.

The methods section identifies each criterion's research background, links to
nine papers and explains protocol-dependent interpretation. It distinguishes
the original oxygen-uptake Log-log model from this intensity-based application,
fitted/observed Dmax anchors and the inclusive 0.4 mmol/L rule from the strict
wording in Jamnick (2018). The software reference and physiological evidence are
separate. Paper links open another tab to retain the current test input.

## Analytics and privacy

Tool ID `lactate_curve_calculator` is shared by Docs and App's source allowlist.
Use the existing SDK only; GA4 maps start/completed/failed to
`tool_start`/`tool_success`/`tool_error`, CTA to `signup_click`, and preserves
`tool_input_rejected` and `tool_no_result`. Lactate-specific mapping retains
input origin/method, engine version, result status and stage.

Origins are `example`, `example_edited`, `user`. Editing an example never makes it
user-provided data; clearing/replacing the dataset does. User-provided does not
prove an authentic physical test. Validation emits rejection before a start;
each calculation has one terminal event: completed, no-result or failed.
Failures after success use `stage=export`, `clipboard` or `visualization` and must
be excluded from the calculation error rate.

Only enum properties, stage-count/file-size buckets and bounded software
duration leave this module. Never send lactate, HR, power, speed/pace, stage
duration, sampling location, file name, file content, input text, exported text
or input hashes. Sentry uses fixed errors; automatic event sanitization removes
messages, user/request/context/breadcrumb data and frame variables while keeping
code locations. Existing PostHog disables autocapture and session recording.
Existing telemetry/environment controls continue to apply. No new visitor ID,
replay, cloud save or share-by-input-URL is introduced.

CTA URLs contain only `from=docs-tool`, `tool=lactate_curve_calculator`,
`cta=result|tool_footer`. App entry reports `source_tool_id`; registration
attribution uses `tool_name`. Existing once-per-session and cross-domain identity
limitations remain. Local tests verify the whitelist and signup attribution,
not production cookie continuity or a completed production registration.

## Monitoring handoff

[`scripts/monitoring/lactate-curve.json`](../scripts/monitoring/lactate-curve.json)
is a versioned **definition**, not a provider API payload or an enabled dashboard.
Create its Usage, Health and Acquisition dashboards in PostHog; register GA4
dimensions and configure GSC Search Performance separately. Do not add user
counts across providers. Filter user-provided usage and acquisition to `user`;
show example/edited-example exploration separately.

Use ordered unique-person funnels for business conversion: 30 minutes for
analysis/arrival, 24 hours for result CTA, seven days for new anonymous entry to
signup/onboarding. Exclude existing authenticated users. Use event counts for
attempt-level failures/no-result; separate missing terminals. Pair a completed
result to a rendered event within 30 seconds for render coverage. The ordered
start-to-render time approximates end-to-end latency; `duration_ms` measures
module loading plus calculation only. No attempt ID is uploaded.

Proposed alert starting points, subject to launch validation:

| Signal | Rule | Owner role |
| --- | --- | --- |
| Synthetic tool smoke | Every 15 minutes; two consecutive failures | Engineering |
| Numerical regression | Any availability/tolerance failure blocks CI/release | Engineering |
| Runtime exceptions | >=100 starts/24 h; load/analysis failures >2% | Engineering |
| End-to-end P95 | >=100 completions/24 h; >2 s and worse than comparable baseline | Engineering |
| Completion decrease | >=100 user-provided visitors in each 7-day window; relative decline >30% | Growth |
| Duplicate/unsafe telemetry | Any illegal enum, duplicate terminal or sensitive property | Engineering |

For sparse traffic, inspect absolute errors and synthetic checks. Zero traffic
is not downtime. The minimum count does not establish statistical significance.
Record a real owner, notification destination, baseline, alert drill and
synthetic-traffic exclusion before activation. No production dashboards, recurring
jobs or notification channels have been enabled by this change.

## Verification and smoke commands

```sh
pnpm --filter @trainingloadai/docs test
pnpm --filter @trainingloadai/docs exec tsc --noEmit --incremental false
pnpm --filter @trainingloadai/client exec vitest run src/lib/app-entry-analytics.test.ts src/lib/product-analytics.test.ts
pnpm --filter @trainingloadai/client exec playwright install chromium webkit
pnpm --filter @trainingloadai/client exec playwright test --config playwright.docs-tools.config.ts
node scripts/monitoring/lactate-smoke.mjs
# Against a preview/production origin; no credentials or input data in URL:
node scripts/monitoring/lactate-smoke.mjs https://www.trainingload.ai
```

The local smoke starts/reuses Docs on localhost:3024; remote smoke expects an
already running site. It uses simulated values, stubs GA4, sets DNT, and verifies
privacy sentinels. Confirm synthetic exclusion in live provider events before
scheduling. The required `docs` check runs Chromium smoke; `core`/`docs` remain
mandatory on all PRs to main, without PR path filters.

Automated coverage includes R references, independent math, unit equivalence,
insufficient/degenerate/multiple-root cases, CSV failures, partial/no-result,
revision invalidation, double submission, exports/print, terminal exclusivity,
sample separation, GA4 mapping, attribution and telemetry sanitization. Browser
projects cover Chromium/WebKit at 1440×900 and 390×844, light/dark and keyboard.
WebKit coverage is automation against the Safari engine, not an assertion that
every shipping Safari/iOS version was manually tested.

## Launch-only acceptance — pending

- Professional review of method explanations, testing protocol and interpretation.
- Search-demand research; no ranking or volume claim is established by this PR.
- Production www→App anonymous identity continuity, actual signup/onboarding,
  DNT/blocked-cookie behavior and every downstream telemetry field.
- Production dashboards, notifications, alert drills and scheduled smoke activation.
- Field Core Web Vitals and acquisition baseline after adequate traffic.

Do not mark these items complete based on unit tests or local previews. This PR
does not authorize production deployment or final merge.
