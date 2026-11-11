import { test, expect } from "@playwright/test";
import polyline from "@mapbox/polyline";
import { openCoachFixture } from "./fixtures/coach-page";

test.use({ viewport: { width: 1440, height: 1100 } });

test("PC activity timeline shares axes, selection and real map lifecycle", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openCoachFixture(page, undefined, { navigate: false });
  const start = Date.parse("2026-11-10T07:00:00Z");
  const duration = 2040;
  let distance = 0;
  const rows = Array.from({ length: duration / 5 + 1 }, (_, index) => {
    const time = index * 5;
    const hard = [
      [480, 720],
      [900, 1140],
      [1320, 1560],
    ].some(([from, to]) => time >= from && time < to);
    const speed = (hard ? 3.8 : 2.9) + 0.12 * Math.sin(index * 0.8);
    if (index) distance += speed * 5;
    return {
      time: new Date(start + time * 1000).toISOString(),
      distance,
      speed,
      heartRate:
        time >= 30
          ? 140 + (hard ? 30 : 0) + 3 * Math.sin(index / 8)
          : undefined,
      cadence: hard ? 91 : 82,
      enhancedAltitude: 50 + 20 * Math.sin(index / 55),
      power: hard ? 300 : 180,
    };
  });
  const track = rows.map(
    (_, index) =>
      [
        start + index * 5000,
        121.45 + 0.02 * Math.cos((index / (rows.length - 1)) * Math.PI * 2),
        31.22 + 0.008 * Math.sin((index / (rows.length - 1)) * Math.PI * 2),
      ] as [number, number, number],
  );
  const activity = {
    id: 7,
    hashId: "timeline-run",
    activityName: "PC 时间线测试 · 3 × 4 分钟",
    sportType: "RUN",
    processingStatus: "READY",
    readyAt: new Date(start).toISOString(),
    startTime: rows[0].time,
    endTime: rows.at(-1)!.time,
    elapsedTime: duration,
    duration,
    distance,
    averageSpeed: distance / duration,
    avgHeartRate: 152,
    maxHeartRate: 176,
    averageCadence: 85,
    elevationGain: 70,
    laps: [
      [0, 480],
      [480, 720],
      [720, 900],
      [900, 1140],
      [1140, 1320],
      [1320, 1560],
      [1560, duration],
    ].map(([from, to], index) => ({
      id: index + 1,
      index,
      startTime: new Date(start + from * 1000).toISOString(),
      endTime: new Date(start + to * 1000).toISOString(),
      elapsedTime: to - from,
    })),
  };
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname
      .replace(/^\/api\/proxy/, "")
      .replace(/^\/api(?=\/activities|\/charts)/, "");
    if (path === "/api/access/features")
      return route.fulfill({ json: { schemaVersion: 1, features: {} } });
    if (path === "/activities/timeline-run")
      return route.fulfill({ json: { data: activity } });
    if (path === "/activities/timeline-run/layer")
      return route.fulfill({
        json: {
          data: {
            maps: [
              {
                hashId: activity.hashId,
                polyline: polyline.encode(
                  track.map((point) => [point[2], point[1]]),
                ),
              },
            ],
            center: [121.45, 31.22],
            bounds: [
              [31.212, 121.43],
              [31.228, 121.47],
            ],
          },
        },
      });
    if (path === "/activities/timeline-run/timeline-track")
      return route.fulfill({
        json: { data: { status: "available", segments: [track] } },
      });
    if (["/heart-rate/zones", "/power/zones", "/pace/zones"].includes(path)) {
      const [first, second] = path.startsWith("/heart")
        ? [150, 165]
        : path.startsWith("/power")
          ? [200, 260]
          : [0.29, 0.33];
      return route.fulfill({
        json: {
          data: {
            zones: [
              { name: "Z1", max: first },
              { name: "Z2", min: first, max: second },
              { name: "Z3", min: second },
            ],
          },
        },
      });
    }
    if (path === "/charts/execute/activity") {
      const metric = url.searchParams.get("metric")!;
      return route.fulfill({
        json: {
          data: {
            rows:
              metric === "altitude"
                ? []
                : rows.map((row) => ({
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
  await page.goto("/zh/activities/timeline-run");
  await page.addStyleTag({
    content:
      ".tsqd-parent-container, nextjs-portal { display: none !important; }",
  });
  await page
    .getByRole("tab", { name: "活动时间线", exact: true })
    .click({ timeout: 20000 });
  const timeline = page.getByRole("region", {
    name: "活动时间线",
    exact: true,
  });
  await expect(timeline.getByRole("img")).toHaveCount(4);
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(1);
  const position = timeline.getByRole("slider");
  await position.focus();
  await page.keyboard.press("ArrowRight");
  await expect(position).toHaveAttribute("aria-valuetext", "0:05");
  await timeline.getByRole("button", { name: /第 2 圈 8:00/ }).click();
  await expect(
    timeline.getByRole("button", { name: /第 2 圈 8:00/ }),
  ).toHaveAttribute("aria-pressed", "true");
  for (const mode of ["心率区间", "功率区间", "配速区间"]) {
    await timeline.getByRole("combobox", { name: "分组方式" }).click();
    await page.getByRole("option", { name: mode, exact: true }).click();
    await expect(
      timeline.getByRole("group", { name: mode }).getByRole("button").first(),
    ).toBeVisible();
  }
  await timeline.getByRole("combobox", { name: "分组方式" }).click();
  await page.getByRole("option", { name: "分段", exact: true }).click();
  const plot = timeline.locator(".cursor-crosshair");
  const bounds = (await plot.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * 0.15, bounds.y + 20);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.35, bounds.y + 20, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(timeline).not.toHaveAttribute("data-timeline-start", "0");
  const zoomStart = await timeline.getAttribute("data-timeline-start");
  const zoomEnd = await timeline.getAttribute("data-timeline-end");
  expect(Number(zoomEnd)).toBeLessThan(duration);
  await timeline.getByRole("button", { name: "时间线选项" }).click();
  await page.getByRole("menuitemradio", { name: "距离", exact: true }).click();
  await expect(timeline).not.toHaveAttribute("data-timeline-start", zoomStart!);
  await timeline.getByRole("button", { name: "时间线选项" }).click();
  await page.getByRole("menuitemradio", { name: "时间", exact: true }).click();
  await expect(timeline).toHaveAttribute("data-timeline-start", zoomStart!);
  await expect(timeline).toHaveAttribute("data-timeline-end", zoomEnd!);
  await timeline.getByRole("button", { name: "时间线选项" }).click();
  await page.getByRole("menuitem", { name: "恢复全程" }).click();
  await expect(timeline).toHaveAttribute("data-timeline-start", "0");
  await timeline.getByRole("button", { name: "配置海拔图表" }).click();
  await page.getByLabel("颜色", { exact: true }).fill("#456789");
  await page.getByRole("combobox", { name: "图表高度" }).click();
  await page.getByRole("option", { name: "较高", exact: true }).click();
  await page.getByRole("combobox", { name: "平滑", exact: true }).click();
  await page.getByRole("option", { name: "10 秒", exact: true }).click();
  await page.keyboard.press("Escape");
  await timeline.getByRole("button", { name: "添加图表", exact: true }).click();
  await page.getByRole("menuitem", { name: "功率", exact: true }).click();
  await expect(timeline.getByRole("img")).toHaveCount(5);
  await timeline.getByRole("button", { name: "配置功率图表" }).click();
  await page.getByRole("button", { name: "删除图表", exact: true }).click();
  await expect(timeline.getByRole("img")).toHaveCount(4);
  await timeline.getByRole("button", { name: "放大心率图表" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "心率", exact: true }),
  ).toBeVisible();
  const expandedCanvas = page.getByRole("dialog").locator("canvas");
  const initialPlot = await expandedCanvas.evaluate(
    (canvas: HTMLCanvasElement) => canvas.toDataURL(),
  );
  const expandedBounds = (await page
    .getByRole("dialog")
    .locator(".u-over")
    .boundingBox())!;
  await page.mouse.move(
    expandedBounds.x + expandedBounds.width * 0.2,
    expandedBounds.y + 20,
  );
  await page.mouse.down();
  await page.mouse.move(
    expandedBounds.x + expandedBounds.width * 0.6,
    expandedBounds.y + 20,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect
    .poll(() =>
      expandedCanvas.evaluate((canvas: HTMLCanvasElement) =>
        canvas.toDataURL(),
      ),
    )
    .not.toBe(initialPlot);
  await page.keyboard.press("Escape");
  await timeline.screenshot({
    path: test.info().outputPath("timeline-light.png"),
  });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await timeline.screenshot({
    path: test.info().outputPath("timeline-dark.png"),
  });
  await page.setViewportSize({ width: 1024, height: 900 });
  const compactPlot = (await plot.boundingBox())!;
  expect(compactPlot.width).toBeGreaterThan(300);
  await timeline.screenshot({
    path: test.info().outputPath("timeline-1024.png"),
  });
  await page.getByRole("tab", { name: "总览", exact: true }).click();
  await expect(timeline).toHaveCount(0);
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(1);
  expect(errors).toEqual([]);
});
