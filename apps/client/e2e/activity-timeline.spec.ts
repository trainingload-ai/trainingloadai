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
  let savedSegments: { revision: number; segments: unknown[] | null } = {
    revision: 0,
    segments: null,
  };
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
    activityPeakMetrics: [
      {
        id: "distance-400",
        type: "pace",
        scaleType: "DISTANCE",
        scaleValue: 400,
        value: 3.8,
        startElapsedSec: 480,
        endElapsedSec: 585,
        startDistanceM: 1400,
        endDistanceM: 1800,
      },
      {
        id: "time-60",
        type: "pace",
        scaleType: "TIME",
        scaleValue: 60,
        value: 3.8,
        startElapsedSec: 480,
        endElapsedSec: 540,
        startDistanceM: 1400,
        endDistanceM: 1628,
      },
    ],
    laps: [
      [0, 480],
      [480, 720],
      [720, 900],
      [900, 1140],
      [1140, 1320],
      [1320, 1560],
      [1560, duration - 3],
      [duration - 3, duration],
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
    if (path === "/activities/timeline-run/timeline-segments") {
      if (route.request().method() === "PUT") {
        const payload = route.request().postDataJSON();
        if (payload.revision !== savedSegments.revision)
          return route.fulfill({
            status: 409,
            json: { message: "TIMELINE_SEGMENTS_STALE" },
          });
        savedSegments = {
          revision: savedSegments.revision + 1,
          segments: payload.segments,
        };
      }
      return route.fulfill({ json: { data: savedSegments } });
    }
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
  await expect(page.getByRole("tablist").getByRole("tab").last()).toHaveText(
    "时间线",
  );
  await page
    .getByRole("tab", { name: "时间线", exact: true })
    .click({ timeout: 20000 });
  const timeline = page.getByRole("region", {
    name: "时间线",
    exact: true,
  });
  await expect(timeline.getByRole("img")).toHaveCount(4);
  await expect(timeline.locator("[data-timeline-statistics]")).toHaveCount(0);
  await expect(timeline.getByText("设备圈段", { exact: true })).toHaveCount(0);
  await expect(timeline.getByText("自定义分段", { exact: true })).toHaveCount(
    0,
  );
  const lapGroups = timeline.getByRole("group", { name: "分段", exact: true });
  const scroller = timeline.locator("[data-timeline-scroll]");
  const expectNoVerticalOverflow = async () => {
    await expect
      .poll(() =>
        scroller.evaluate(
          (element) => element.scrollHeight - element.clientHeight,
        ),
      )
      .toBe(0);
  };
  await expectNoVerticalOverflow();
  expect(
    await scroller.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true);
  const firstLap = (await timeline
    .locator('[data-segment-id="lap:1"]')
    .boundingBox())!;
  const secondLap = (await timeline
    .locator('[data-segment-id="lap:2"]')
    .boundingBox())!;
  const fullPlot = (await timeline.locator(".cursor-crosshair").boundingBox())!;
  expect(firstLap.width / secondLap.width).toBeCloseTo(2, 1);
  expect(firstLap.x).toBeCloseTo(fullPlot.x, 0);
  expect(secondLap.x - fullPlot.x).toBeCloseTo(firstLap.width, 0);
  await expect(timeline.locator('[data-segment-id="lap:1"]')).toHaveAttribute(
    "data-segment-detail",
    "full",
  );
  await expect(timeline.locator('[data-segment-id="lap:3"]')).toHaveAttribute(
    "data-segment-detail",
    "compact",
  );
  const insidePlot = (await timeline
    .getByRole("img")
    .first()
    .locator(".u-over")
    .boundingBox())!;
  expect(insidePlot.x).toBeCloseTo(fullPlot.x, 0);
  const tail = lapGroups.getByRole("button", { name: /^第 8 圈/ });
  const tailWidth = (await timeline
    .locator('[data-segment-id="lap:8"]')
    .boundingBox())!.width;
  expect(tailWidth).toBeCloseTo(32, 0);
  await tail.click();
  await expect(timeline.locator("[data-timeline-statistics]")).toHaveCount(4);
  const cadenceStatistics = timeline.locator(
    '[data-timeline-row="cadence"] [data-timeline-statistics]',
  );
  await expect(cadenceStatistics.locator("dd")).toHaveText([
    "164",
    "164",
    "164",
  ]);
  const hoverPlot = (await timeline
    .locator(".cursor-crosshair")
    .boundingBox())!;
  await page.mouse.move(hoverPlot.x + hoverPlot.width * 0.4, hoverPlot.y + 30);
  await expect(timeline.locator("[data-timeline-reading]")).toHaveCount(4);
  const readingBounds = (await timeline
    .locator("[data-timeline-reading]")
    .first()
    .boundingBox())!;
  expect(readingBounds.x).toBeGreaterThanOrEqual(hoverPlot.x);
  expect(readingBounds.x + readingBounds.width).toBeLessThanOrEqual(
    hoverPlot.x + hoverPlot.width,
  );
  await expect(cadenceStatistics.locator("dd")).toHaveText([
    "164",
    "164",
    "164",
  ]);
  expect(
    (await timeline.locator('[data-segment-id="lap:8"]').boundingBox())!.width,
  ).toBeCloseTo(tailWidth, 5);
  await expect(timeline.locator('[data-segment-id="lap:8"]')).toHaveAttribute(
    "data-segment-detail",
    "marker",
  );
  await page.mouse.click(hoverPlot.x + hoverPlot.width * 0.4, hoverPlot.y + 30);
  await page.mouse.move(0, 0);
  await expect(timeline.locator("[data-timeline-reading]")).toHaveCount(0);
  await expect(timeline.locator("[data-timeline-cursor]")).toHaveCount(0);
  await expect(cadenceStatistics.locator("dd")).toHaveText([
    "164",
    "164",
    "164",
  ]);
  await tail.hover();
  await expect(page.getByRole("tooltip")).toContainText("0:03");
  await expect(page.locator('[data-slot="tooltip-content"]')).toHaveAttribute(
    "data-side",
    "top",
  );
  await page.locator('[data-slot="tooltip-content"]').screenshot({
    path: test.info().outputPath("timeline-short-segment-tooltip.png"),
  });
  await tail.focus();
  await page.keyboard.press("Escape");
  await tail.click();
  await expect(timeline.locator("[data-timeline-statistics]")).toHaveCount(0);
  await tail.click();
  await page.mouse.move(0, 0);
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("tooltip")).toContainText("0:03");
  await page.keyboard.press("Escape");
  expect(
    await scroller.evaluate((element) => element.scrollLeft),
  ).toBeGreaterThan(0);
  const scrolledLap = (await lapGroups
    .getByRole("button")
    .first()
    .boundingBox())!;
  const scrolledPlot = (await timeline
    .locator(".cursor-crosshair")
    .boundingBox())!;
  expect(scrolledLap.x).toBeLessThan(scrolledPlot.x);
  expect(scrolledPlot.width).toBeLessThan(1200);
  await expect(
    timeline.getByRole("combobox", { name: "分组方式" }),
  ).toHaveCount(0);
  await timeline.getByRole("button", { name: "编辑分段", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "编辑分段", exact: true });
  await editor.getByLabel("分段名称", { exact: true }).fill("收尾");
  await editor.getByLabel("起点（分:秒）", { exact: true }).fill("33:56");
  await expect(
    editor.getByRole("button", { name: "保存分段", exact: true }),
  ).toBeDisabled();
  await editor.getByLabel("起点（分:秒）", { exact: true }).fill("33:57");
  await editor.screenshot({
    path: test.info().outputPath("timeline-segment-editor.png"),
  });
  await editor.getByRole("button", { name: "保存分段", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(timeline.getByRole("button", { name: /^收尾 / })).toBeVisible();
  expect(savedSegments.revision).toBe(1);
  expect(savedSegments.segments?.at(-1)).toMatchObject({
    name: "收尾",
    start: duration - 3,
    end: duration,
  });
  const settingsBounds = (await timeline
    .getByRole("button", { name: "配置海拔图表" })
    .boundingBox())!;
  const expandBounds = (await timeline
    .getByRole("button", { name: "放大海拔图表" })
    .boundingBox())!;
  expect(
    Math.abs(
      settingsBounds.y +
        settingsBounds.height / 2 -
        (expandBounds.y + expandBounds.height / 2),
    ),
  ).toBeLessThan(2);
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(1);
  const position = timeline.getByRole("slider");
  await position.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(position).toHaveAttribute("aria-valuetext", "0:05");
  await timeline.getByRole("button", { name: /第 2 圈 8:00/ }).click();
  await expect(
    timeline.getByRole("button", { name: /第 2 圈 8:00/ }),
  ).toHaveAttribute("aria-pressed", "true");
  const expectSelectionAligned = async () => {
    const segment = (await timeline
      .locator('[data-segment-id="lap:2"]')
      .boundingBox())!;
    const selection = (await timeline
      .locator("[data-timeline-selection]")
      .boundingBox())!;
    expect(selection.x).toBeCloseTo(segment.x, 0);
    expect(selection.width).toBeCloseTo(segment.width, 0);
  };
  await expectSelectionAligned();
  const meanSpeed =
    rows.slice(96, 144).reduce((total, row) => total + row.speed, 0) / 48;
  const paceSeconds = Math.round(1000 / meanSpeed);
  await expect(
    timeline
      .locator('[data-timeline-row="pace"] [data-timeline-statistics] dd')
      .first(),
  ).toHaveText(
    `${Math.floor(paceSeconds / 60)}:${String(paceSeconds % 60).padStart(2, "0")}`,
  );
  await timeline.getByRole("button", { name: "时间线选项" }).click();
  await page.getByRole("menuitemradio", { name: "距离", exact: true }).click();
  await expectSelectionAligned();
  await expectNoVerticalOverflow();
  const firstDistanceLap = (await timeline
    .locator('[data-segment-id="lap:1"]')
    .boundingBox())!;
  const secondDistanceLap = (await timeline
    .locator('[data-segment-id="lap:2"]')
    .boundingBox())!;
  expect(firstDistanceLap.width / secondDistanceLap.width).toBeCloseTo(
    rows[96].distance / (rows[144].distance - rows[96].distance),
    3,
  );
  expect(
    (await timeline.locator('[data-segment-id="lap:8"]').boundingBox())!.width,
  ).toBeCloseTo(32, 0);
  await timeline.getByRole("button", { name: "时间线选项" }).click();
  await page.getByRole("menuitemradio", { name: "时间", exact: true }).click();
  const plot = timeline.locator(".cursor-crosshair");
  const bounds = (await plot.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * 0.15, bounds.y + 20);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.35, bounds.y + 20, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(timeline.locator("[data-timeline-statistics]")).toHaveCount(4);
  await expect(cadenceStatistics.locator("dd").nth(1)).toHaveText("164");
  await expect(cadenceStatistics.locator("dd").nth(2)).toHaveText("164");
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
  await expect(timeline.locator("[data-timeline-statistics]")).toHaveCount(4);
  await expect(cadenceStatistics).toHaveAttribute("data-statistics-start", "0");
  await expect(cadenceStatistics).toHaveAttribute(
    "data-statistics-end",
    String(duration),
  );
  await expect(cadenceStatistics.locator("dd")).toHaveText([
    "170",
    "164",
    "182",
  ]);
  await timeline.getByRole("slider").press("Home");
  await expect(timeline.locator("[data-timeline-reading]")).toHaveCount(4);
  await page.keyboard.press("Tab");
  await expect(timeline.locator("[data-timeline-reading]")).toHaveCount(0);
  await expect(cadenceStatistics.locator("dd")).toHaveText([
    "170",
    "164",
    "182",
  ]);
  await timeline.getByRole("button", { name: "配置海拔图表" }).click();
  await page.getByRole("button", { name: "选择颜色", exact: true }).click();
  await page.getByRole("button", { name: "#3b82f6", exact: true }).click();
  await page.getByRole("button", { name: "选择颜色", exact: true }).click();
  await page.getByLabel("Hex", { exact: true }).fill("#45");
  await expect(
    page.getByRole("group", { name: "颜色", exact: true }),
  ).toContainText("#3B82F6");
  await page.getByLabel("Hex", { exact: true }).fill("#456789");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "颜色面板", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("dialog", { name: "配置海拔图表", exact: true })
    .screenshot({ path: test.info().outputPath("timeline-settings.png") });
  await page.getByRole("combobox", { name: "图表高度" }).click();
  await page.getByRole("option", { name: "较高", exact: true }).click();
  await page.getByRole("combobox", { name: "平滑", exact: true }).click();
  await page.getByRole("option", { name: "10 秒", exact: true }).click();
  await page.keyboard.press("Escape");
  await timeline.getByRole("button", { name: "添加图表", exact: true }).click();
  const addDialog = page.getByRole("dialog", { name: "添加图表", exact: true });
  await expect(addDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(timeline.getByRole("img")).toHaveCount(4);
  await expect(
    timeline.getByRole("button", { name: "添加图表", exact: true }),
  ).toBeFocused();
  await timeline.getByRole("button", { name: "添加图表", exact: true }).click();
  await addDialog.screenshot({
    path: test.info().outputPath("timeline-add-dialog.png"),
  });
  await addDialog.getByRole("button", { name: "功率", exact: true }).click();
  await expect(addDialog).toHaveCount(0);
  await expect(timeline.getByRole("img")).toHaveCount(5);
  await timeline.getByRole("button", { name: "配置功率图表" }).click();
  await page.getByRole("combobox", { name: "图表高度" }).click();
  await page.getByRole("option", { name: "紧凑", exact: true }).click();
  await page.keyboard.press("Escape");
  const compactPowerRow = timeline.locator("[data-timeline-row]").filter({
    has: page.getByRole("button", { name: "配置功率图表" }),
  });
  await expect
    .poll(async () => (await compactPowerRow.boundingBox())?.height)
    .toBe(65);
  await expectNoVerticalOverflow();
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
  const readingPlot = (await plot.boundingBox())!;
  await page.mouse.move(
    readingPlot.x + readingPlot.width * 0.5,
    readingPlot.y + 20,
  );
  await expect(
    timeline.locator("[data-timeline-reading]").first(),
  ).toBeVisible();
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
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.getByRole("tab", { name: "最佳表现", exact: true }).click();
  const best = page.getByRole("tabpanel", { name: "最佳表现", exact: true });
  const table = best.getByRole("table");
  const firstRow = table.getByRole("row").nth(1);
  const intervalRows = rows.filter((row) => {
    const elapsed = (Date.parse(row.time) - start) / 1000;
    return elapsed >= 480 && elapsed < 585;
  });
  const expectedAverage = Math.round(
    intervalRows.reduce((sum, row) => sum + row.heartRate!, 0) /
      intervalRows.length,
  );
  const expectedMaximum = Math.round(
    Math.max(...intervalRows.map((row) => row.heartRate!)),
  );
  await expect(firstRow.getByRole("cell").nth(4)).toHaveText(
    `${expectedAverage} bpm`,
  );
  await expect(firstRow.getByRole("cell").nth(5)).toHaveText(
    `${expectedMaximum} bpm`,
  );
  await best.getByRole("button", { name: "编辑列", exact: true }).click();
  const columnEditor = page.getByRole("dialog", {
    name: "编辑列",
    exact: true,
  });
  await expect(columnEditor.getByRole("checkbox")).toHaveCount(0);
  await columnEditor
    .getByRole("button", { name: "移除平均心率", exact: true })
    .click();
  await expect(
    columnEditor.getByRole("button", { name: "添加平均心率", exact: true }),
  ).toBeVisible();
  await columnEditor
    .getByRole("button", { name: "添加平均功率", exact: true })
    .click();
  const powerHandle = columnEditor.getByRole("button", {
    name: "拖动平均功率",
    exact: true,
  });
  const source = (await powerHandle.boundingBox())!;
  const target = (await columnEditor
    .getByRole("button", { name: "拖动最大心率", exact: true })
    .boundingBox())!;
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2 - 8,
  );
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 10 },
  );
  await page.mouse.up();
  const handles = columnEditor.getByRole("button", { name: /^拖动/ });
  await expect(handles.nth(4)).toHaveAttribute("aria-label", "拖动平均功率");
  await expect(powerHandle).not.toHaveAttribute("aria-pressed", "true");
  await powerHandle.focus();
  await page.keyboard.press("Space");
  await expect(powerHandle).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const lifted = (await powerHandle.boundingBox())!;
  await page.keyboard.press("ArrowUp");
  await expect
    .poll(async () => (await powerHandle.boundingBox())!.y)
    .toBeLessThan(lifted.y);
  await page.keyboard.press("Space");
  await expect(handles.nth(3)).toHaveAttribute("aria-label", "拖动平均功率");
  await columnEditor.screenshot({
    path: test.info().outputPath("best-efforts-columns.png"),
  });
  await columnEditor.getByRole("button", { name: "应用", exact: true }).click();
  await expect(table.getByRole("columnheader").nth(3)).toHaveText("平均功率");
  await expect(firstRow.getByRole("cell").nth(3)).toHaveText("300 W");
  await expect(
    table.getByRole("columnheader", { name: "平均心率", exact: true }),
  ).toHaveCount(0);
  await best.getByRole("button", { name: /^配速 · 400/ }).click();
  await expect(
    best.getByRole("button", { name: /^配速 · 400/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: "按时间", exact: true }).click();
  await expect(
    best.getByRole("columnheader", { name: "平均心率", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "按距离", exact: true }).click();
  await expect(
    best.getByRole("columnheader", { name: "平均心率", exact: true }),
  ).toHaveCount(0);
  await best.screenshot({
    path: test.info().outputPath("best-efforts-light.png"),
  });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await best.screenshot({
    path: test.info().outputPath("best-efforts-dark.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: activity.activityName, exact: true }),
  ).toBeVisible();
  await expect(best).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("activity-mobile.png"),
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole("tab", { name: "总览", exact: true }).click();
  await expect(timeline).toHaveCount(0);
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(1);
  expect(errors).toEqual([]);
});
