import { test, expect } from "@playwright/test";
import { openCoachFixture } from "./fixtures/coach-page";

test.use({ viewport: { width: 1440, height: 1100 } });

test("timeline preserves failed rows and saved segments, retries locally and reuses warm data", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openCoachFixture(page, undefined, { navigate: false });
  const started = Date.parse("2026-11-10T07:00:00Z");
  const rows = Array.from({ length: 61 }, (_, index) => ({
    time: new Date(started + index * 5000).toISOString(),
    distance: index * 15,
    speed: 3,
    heartRate: index === 60 ? 180 : 140,
    cadence: 82,
    enhancedAltitude: 50 + index / 10,
  }));
  const activity = {
    id: 8,
    hashId: "timeline-recovery",
    activityName: "时间线失败恢复验证",
    sportType: "RUN",
    processingStatus: "READY",
    readyAt: new Date(started).toISOString(),
    startTime: rows[0].time,
    endTime: rows.at(-1)!.time,
    elapsedTime: 300,
    duration: 300,
    distance: 900,
    laps: [
      {
        id: 1,
        index: 0,
        startTime: rows[0].time,
        endTime: rows.at(-1)!.time,
        elapsedTime: 300,
      },
    ],
  };
  let failSegments = true,
    failHeartRate = true,
    trackReads = 0,
    heartRateReads = 0,
    altitudeReads = 0;
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname
      .replace(/^\/api\/proxy/, "")
      .replace(/^\/api(?=\/activities|\/charts)/, "");
    if (path === "/api/access/features")
      return route.fulfill({ json: { schemaVersion: 1, features: {} } });
    if (path === "/activities/timeline-recovery")
      return route.fulfill({ json: { data: activity } });
    if (path === "/activities/timeline-recovery/layer")
      return route.fulfill({
        json: { data: { maps: [], center: null, bounds: null } },
      });
    if (path === "/activities/timeline-recovery/timeline-track") {
      trackReads++;
      return route.fulfill({
        json: { data: { status: "unavailable", reason: "NO_TRACK" } },
      });
    }
    if (path === "/activities/timeline-recovery/timeline-segments")
      return failSegments
        ? route.fulfill({ status: 503, json: { message: "Unavailable" } })
        : route.fulfill({
            json: {
              data: {
                revision: 7,
                segments: [
                  {
                    id: "custom:1",
                    name: "已保存的分析段",
                    start: 0,
                    end: 300,
                  },
                ],
              },
            },
          });
    if (["/heart-rate/zones", "/power/zones", "/pace/zones"].includes(path))
      return route.fulfill({ json: { data: { zones: [] } } });
    if (path === "/charts/execute/activity") {
      const metric = url.searchParams.get("metric")!;
      if (metric === "heartRate") {
        heartRateReads++;
        if (failHeartRate)
          return route.fulfill({
            status: 422,
            json: { message: "Unavailable" },
          });
      }
      if (metric === "altitude") {
        altitudeReads++;
        return route.fulfill({
          status: 422,
          json: { message: "Unavailable fallback altitude" },
        });
      }
      return route.fulfill({
        json: {
          data: {
            rows: rows.map((row) => ({
              time: row.time,
              distance: row.distance,
              [metric]: row[metric as keyof typeof row],
            })),
            metadata: {},
          },
        },
      });
    }
    return route.fallback();
  });
  await page.goto("/zh/activities/timeline-recovery");
  await page.addStyleTag({
    content: ".tsqd-parent-container, nextjs-portal {display:none!important}",
  });
  await page.getByRole("tab", { name: "时间线", exact: true }).click();
  const timeline = page.getByRole("region", { name: "时间线", exact: true });
  const heartRow = timeline.locator('[data-timeline-row="heartRate"]');
  await expect(heartRow).toHaveAttribute("data-metric-state", "error");
  await expect(heartRow.getByRole("alert")).toContainText("心率数据加载失败");
  await expect(timeline.getByRole("img")).toHaveCount(4);
  await expect(
    timeline.locator('[data-timeline-row="elevation"]'),
  ).toHaveAttribute("data-metric-state", "ready");
  await expect(
    timeline.getByRole("alert").filter({ hasText: "分段加载失败" }),
  ).toBeVisible();
  await expect(timeline.locator("[data-segment-id]")).toHaveCount(0);
  await expect(
    timeline.getByRole("button", { name: "编辑分段", exact: true }),
  ).toBeDisabled();
  await timeline.screenshot({
    path: test.info().outputPath("timeline-failure-light.png"),
  });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(
    heartRow.getByRole("button", { name: "重试心率图表", exact: true }),
  ).toBeVisible();
  await timeline.screenshot({
    path: test.info().outputPath("timeline-failure-dark-1024.png"),
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  failSegments = false;
  await timeline
    .getByRole("alert")
    .filter({ hasText: "分段加载失败" })
    .getByRole("button", { name: "重试", exact: true })
    .click();
  await expect(
    timeline.getByRole("button", { name: /^已保存的分析段/ }),
  ).toBeVisible();
  await expect(timeline.locator('[data-segment-id="lap:1"]')).toHaveCount(0);
  await expect(heartRow).toHaveAttribute("data-metric-state", "error");
  const otherRequests = { track: trackReads, altitude: altitudeReads };
  failHeartRate = false;
  await heartRow
    .getByRole("button", { name: "重试心率图表", exact: true })
    .click();
  await expect(heartRow).toHaveAttribute("data-metric-state", "ready");
  await expect(heartRow.locator("[data-timeline-statistics] dd")).toHaveText([
    "140",
    "140",
    "180",
  ]);
  expect(trackReads).toBe(otherRequests.track);
  expect(altitudeReads).toBe(otherRequests.altitude);
  const warmRequests = {
    track: trackReads,
    heartRate: heartRateReads,
    altitude: altitudeReads,
  };
  await page.getByRole("tab", { name: "总览", exact: true }).click();
  await expect(timeline).toHaveCount(0);
  await page.getByRole("tab", { name: "时间线", exact: true }).click();
  await expect(
    timeline.getByRole("button", { name: /^已保存的分析段/ }),
  ).toBeVisible();
  await expect(heartRow).toHaveAttribute("data-metric-state", "ready");
  expect({
    track: trackReads,
    heartRate: heartRateReads,
    altitude: altitudeReads,
  }).toEqual(warmRequests);
  await timeline.screenshot({
    path: test.info().outputPath("timeline-failure-recovered.png"),
  });
});
