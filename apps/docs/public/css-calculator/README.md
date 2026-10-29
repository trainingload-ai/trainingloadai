# CSS calculator plan screenshots

Captured in the existing dark theme on 2026-09-28 with synthetic swimming-plan data in Simplified Chinese,
Traditional Chinese, English, and Japanese. These assets contain no athlete data.

- `phone-plan-dark-*.webp`: actual iOS App Plan tab using the existing
  `apps/mobile/src/features/plans/components/plan-active-overview.tsx`
  and its production components. Exported with the Screenshot button in
  **Device Hub**, iPhone 17 Pro Max (iOS 26.5), 1320 × 2868.
- `web-plan-dark-*.webp`: existing
  `apps/client/src/app/[locale]/(main)/plan/page.tsx`, rendered with mock query responses
  in a local capture harness at 1200 × 960. Shared components and styles are
  unchanged; screenshots show the plan content without app navigation.

The fixture is an eight-week swimming plan in week four, with three sessions per
week. The displayed day is 2026-08-14. Today's workout is five minutes of warm-up,
eight 100 m repeats at 1:40/100 m with 20 seconds of recovery after each, then
three minutes of cool-down (24 minutes total). Two sessions that week are complete.

Native capture uses the isolated `app-store-demo` data transport and existing
localization. Temporary fixture injection was removed after capture. No production
API requests or account mutations were needed. Screenshots are encoded as WebP;
page layout, text and workout graphics were not painted over or recreated.
