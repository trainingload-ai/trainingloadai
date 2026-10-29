import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { openCoachFixture } from "./fixtures/coach-page";

type MarketingDistance = "5k" | "10k" | "half-marathon" | "marathon";

const distanceConfig = {
  "5k": { directory: "5k-training-plan", weeks: 8, runsPerWeek: 3 },
  "10k": { directory: "10k-training-plan", weeks: 10, runsPerWeek: 3 },
  "half-marathon": {
    directory: "half-marathon-training-plan",
    weeks: 14,
    runsPerWeek: 4,
  },
  marathon: {
    directory: "marathon-training-plan",
    weeks: 18,
    runsPerWeek: 4,
  },
} as const;
const requestedMarketingDistance = process.env.MARKETING_PLAN_DISTANCE ?? "5k";
const selfHostReadmeCapture = process.env.SELF_HOST_README_CAPTURE === "1";

if (!(requestedMarketingDistance in distanceConfig)) {
  throw new Error(
    `Unsupported MARKETING_PLAN_DISTANCE: ${requestedMarketingDistance}`,
  );
}

const marketingDistance = requestedMarketingDistance as MarketingDistance;
const activeDistance = distanceConfig[marketingDistance];
const planId = `marketing-${marketingDistance}-plan`;
const workoutDays = activeDistance.runsPerWeek === 4 ? [1, 3, 5, 7] : [1, 3, 5];
const captureLocales = ["zh", "zh-hant", "en", "ja"] as const;
type CaptureLocale = (typeof captureLocales)[number];

const fiveKCaptureCopy: Record<
  CaptureLocale,
  {
    planTitle: string;
    planDescription: string;
    planGoal: string;
    workoutNames: [string, string, string];
    workoutTexts: [string, string, string];
    notes: string;
    week: (week: number) => string;
    coachQuestion: string;
    coachAnswer: string;
    todayAdvice: string;
    todayTags: [string, string, string];
    recentActivity: string;
  }
> = {
  zh: {
    planTitle: "8 周 5K 完赛计划",
    planDescription: "从稳定跑步基础到连续完成 5 公里，每周 3 次跑步。",
    planGoal: "连续完成 5 公里",
    workoutNames: ["对话强度轻松跑", "稳定跑", "长距离轻松跑"],
    workoutTexts: [
      "轻松跑，保持可以完整说话的强度。",
      "热身后完成稳定跑，始终保持动作放松。",
      "以轻松强度延长时间，不追求配速。",
    ],
    notes: "根据当天体感调整；出现疼痛时停止训练。",
    week: (week) => `第 ${week} 周`,
    coachQuestion: "这周漏了一次轻松跑，周日长跑还要照常完成吗？",
    coachAnswer:
      "不用补课。你本周已完成两次训练，当前状态适合继续计划。周日保留 35 分钟轻松跑，全程保持可对话强度；如果热身后双腿仍沉重，就缩短到 25 分钟。",
    todayAdvice:
      "今天完成 33 分钟轻松跑，保持可以完整说话的强度。训练后留意双腿恢复，不需要追回之前漏掉的课。",
    todayTags: ["轻松跑", "33 分钟", "保持节奏"],
    recentActivity: "晨间轻松跑",
  },
  "zh-hant": {
    planTitle: "8 週 5K 完賽計畫",
    planDescription: "從穩定跑步基礎到連續完成 5 公里，每週 3 次跑步。",
    planGoal: "連續完成 5 公里",
    workoutNames: ["對話強度輕鬆跑", "穩定跑", "長距離輕鬆跑"],
    workoutTexts: [
      "輕鬆跑，保持可以完整說話的強度。",
      "熱身後完成穩定跑，始終保持動作放鬆。",
      "以輕鬆強度延長時間，不追求配速。",
    ],
    notes: "根據當天體感調整；出現疼痛時停止訓練。",
    week: (week) => `第 ${week} 週`,
    coachQuestion: "這週漏了一次輕鬆跑，週日長跑還要照常完成嗎？",
    coachAnswer:
      "不用補課。你本週已完成兩次訓練，目前狀態適合繼續計畫。週日保留 35 分鐘輕鬆跑，全程保持可對話強度；如果熱身後雙腿仍沉重，就縮短到 25 分鐘。",
    todayAdvice:
      "今天完成 33 分鐘輕鬆跑，保持可以完整說話的強度。訓練後留意雙腿恢復，不需要追回之前漏掉的課。",
    todayTags: ["輕鬆跑", "33 分鐘", "保持節奏"],
    recentActivity: "晨間輕鬆跑",
  },
  en: {
    planTitle: "8-Week 5K Finish Plan",
    planDescription:
      "Build from a steady running base to completing 5K with 3 runs each week.",
    planGoal: "Run 5K continuously",
    workoutNames: ["Conversational easy run", "Steady run", "Long easy run"],
    workoutTexts: [
      "Run easily enough to speak in complete sentences.",
      "Warm up, then run steadily while keeping your form relaxed.",
      "Extend the duration at an easy effort without chasing pace.",
    ],
    notes: "Adjust to how you feel today and stop if pain changes your stride.",
    week: (week) => `Week ${week}`,
    coachQuestion:
      "I missed an easy run this week. Should I still do Sunday's long run?",
    coachAnswer:
      "Do not make up the missed run. You have completed 2 sessions and can continue the plan. Keep Sunday's 35-minute run conversational; shorten it to 25 minutes if your legs still feel heavy after the warm-up.",
    todayAdvice:
      "Complete an easy 33-minute run today at a fully conversational effort. Check how your legs recover afterward; there is no need to make up the missed session.",
    todayTags: ["Easy run", "33 minutes", "Stay relaxed"],
    recentActivity: "Morning easy run",
  },
  ja: {
    planTitle: "8週間 5K完走プラン",
    planDescription:
      "安定したランニング習慣から、週3回の練習で5K完走を目指します。",
    planGoal: "5Kを連続して走る",
    workoutNames: [
      "会話できるイージーラン",
      "ステディラン",
      "ロングイージーラン",
    ],
    workoutTexts: [
      "会話を続けられる楽な強度で走ります。",
      "ウォームアップ後、フォームを保って安定した強度で走ります。",
      "ペースを追わず、楽な強度で時間を延ばします。",
    ],
    notes: "当日の感覚に合わせて調整し、痛みが出たら中止してください。",
    week: (week) => `${week}週目`,
    coachQuestion:
      "今週イージーランを1回休みました。日曜のロング走は予定通りでいいですか？",
    coachAnswer:
      "休んだ分を追加する必要はありません。今週は2回完了しているので計画を続けられます。日曜は35分の会話できる強度を維持し、ウォームアップ後も脚が重ければ25分に短縮してください。",
    todayAdvice:
      "今日は会話できる強度で33分のイージーランを行います。終了後の脚の回復を確認し、休んだ練習を追加する必要はありません。",
    todayTags: ["イージーラン", "33分", "リラックス"],
    recentActivity: "朝のイージーラン",
  },
};

const distanceNames: Record<
  CaptureLocale,
  Record<MarketingDistance, { name: string; title: string; goal: string }>
> = {
  zh: {
    "5k": { name: "5K", title: "8 周 5K 完赛计划", goal: "连续完成 5 公里" },
    "10k": {
      name: "10K",
      title: "10 周 10 公里完赛计划",
      goal: "轻松完成 10 公里",
    },
    "half-marathon": {
      name: "半马",
      title: "14 周半马完赛计划",
      goal: "完成首个半程马拉松",
    },
    marathon: {
      name: "全马",
      title: "18 周马拉松完赛计划",
      goal: "完成首场马拉松",
    },
  },
  "zh-hant": {
    "5k": { name: "5K", title: "8 週 5K 完賽計畫", goal: "連續完成 5 公里" },
    "10k": {
      name: "10K",
      title: "10 週 10 公里完賽計畫",
      goal: "輕鬆完成 10 公里",
    },
    "half-marathon": {
      name: "半馬",
      title: "14 週半馬完賽計畫",
      goal: "完成首個半程馬拉松",
    },
    marathon: {
      name: "全馬",
      title: "18 週馬拉松完賽計畫",
      goal: "完成首場馬拉松",
    },
  },
  en: {
    "5k": {
      name: "5K",
      title: "8-Week 5K Finish Plan",
      goal: "Run 5K continuously",
    },
    "10k": {
      name: "10K",
      title: "10-Week 10K Finish Plan",
      goal: "Finish 10K comfortably",
    },
    "half-marathon": {
      name: "Half marathon",
      title: "14-Week Half Marathon Plan",
      goal: "Finish a first half marathon",
    },
    marathon: {
      name: "Marathon",
      title: "18-Week Marathon Finish Plan",
      goal: "Finish a first marathon",
    },
  },
  ja: {
    "5k": { name: "5K", title: "8週間 5K完走プラン", goal: "5Kを連続して走る" },
    "10k": {
      name: "10km",
      title: "10週間 10km完走プラン",
      goal: "10kmを余裕を持って完走",
    },
    "half-marathon": {
      name: "ハーフ",
      title: "14週間 ハーフマラソンプラン",
      goal: "初めてのハーフを完走",
    },
    marathon: {
      name: "フル",
      title: "18週間 フルマラソンプラン",
      goal: "初めてのフルを完走",
    },
  },
};

function copyForDistance(locale: CaptureLocale) {
  const base = fiveKCaptureCopy[locale];
  const distance = distanceNames[locale][marketingDistance];
  if (marketingDistance === "5k") return base;

  const descriptions: Record<CaptureLocale, string> = {
    zh: `${activeDistance.weeks} 周逐步增加耐力，每周 ${activeDistance.runsPerWeek} 次跑步。`,
    "zh-hant": `${activeDistance.weeks} 週逐步增加耐力，每週 ${activeDistance.runsPerWeek} 次跑步。`,
    en: `Build endurance across ${activeDistance.weeks} weeks with ${activeDistance.runsPerWeek} runs each week.`,
    ja: `${activeDistance.weeks}週間、週${activeDistance.runsPerWeek}回のランで持久力を伸ばします。`,
  };

  return {
    ...base,
    planTitle: distance.title,
    planDescription: descriptions[locale],
    planGoal: distance.goal,
    workoutNames: base.workoutNames.map((name) =>
      name.replace(/5K|5 公里|5公里/g, distance.name),
    ) as [string, string, string],
  };
}

const captureCopy = Object.fromEntries(
  captureLocales.map((locale) => [locale, copyForDistance(locale)]),
) as typeof fiveKCaptureCopy;

function fixtureIdentity(locale: CaptureLocale) {
  return selfHostReadmeCapture
    ? {
        membershipPlan: "FREE" as const,
        userName: locale === "zh" || locale === "zh-hant" ? "运动员" : "Athlete",
        userEmail: "athlete@self-host.local",
      }
    : {};
}

function fixtureSessions(locale: CaptureLocale) {
  if (!selfHostReadmeCapture) return undefined;
  const title =
    locale === "zh"
      ? "5K 训练复盘"
      : locale === "zh-hant"
        ? "5K 訓練復盤"
        : locale === "ja"
          ? "5K トレーニング振り返り"
          : "5K training review";
  return [
    {
      id: "coach-stream-fixture",
      title,
      updatedAt: "2026-10-30T03:01:00.000Z",
      pinnedAt: null,
    },
  ];
}

const blocks = [
  {
    type: "work",
    steps: [
      { duration: 300, stepKind: "WARMUP" },
      {
        duration: 1200,
        stepKind: "WORK",
        paceKmh: 3600 / 420,
        primaryTargetMeta: { kind: "SPEED", zoneIndex: 1 },
      },
      { duration: 300, stepKind: "COOLDOWN" },
    ],
  },
];

function createWorkouts(locale: CaptureLocale) {
  const copy = captureCopy[locale];
  const workoutCount = activeDistance.weeks * activeDistance.runsPerWeek;
  return Array.from({ length: workoutCount }, (_, index) => {
    const weekIndex = Math.floor(index / activeDistance.runsPerWeek) + 1;
    const session = index % activeDistance.runsPerWeek;
    const dayIndex = workoutDays[session];
    const dayOffset = (weekIndex - 1) * 7 + dayIndex - 1;
    const scheduledDate = new Date(
      Date.UTC(2026, 9, 5 + dayOffset),
    ).toISOString();
    const skipped = index === 8;
    const done = index < 11 && !skipped;
    const duration = 1500 + session * 300 + (weekIndex - 1) * 60;
    return {
      id: `marketing-5k-workout-${index + 1}`,
      planId,
      weekIndex,
      dayIndex,
      dayOffset,
      sessionIndex: 1,
      scheduledDate,
      name: `${copy.workoutNames[session % copy.workoutNames.length]} · ${copy.week(weekIndex)}`,
      text: copy.workoutTexts[session % copy.workoutTexts.length],
      notes: copy.notes,
      sportType: "RUN",
      status: skipped ? "SKIPPED" : done ? "DONE" : "PLANNED",
      structureKind: "ENDURANCE",
      structure: { kind: "ENDURANCE", version: 1, blocks },
      blocks,
      summary: {
        kind: "ENDURANCE",
        durationSeconds: duration,
        stepCount: 3,
        hardSession: session === 1,
      },
      links: [],
      capabilities: { delete: !done, postpone: !done, skip: !done },
      estimatedLoad: 24 + session * 6 + weekIndex * 2,
    };
  });
}

async function openMarketingPlan(
  page: Page,
  locale: CaptureLocale,
  theme: "light" | "dark" = "light",
) {
  const copy = captureCopy[locale];
  const workouts = createWorkouts(locale);
  await page.clock.setFixedTime(new Date("2026-10-30T03:00:00Z"));
  await page.addInitScript((selectedTheme) => {
    localStorage.setItem("theme", selectedTheme);
  }, theme);
  await openCoachFixture(page, undefined, {
    ...fixtureIdentity(locale),
    navigate: false,
  });
  const plan = {
    id: planId,
    title: copy.planTitle,
    description: copy.planDescription,
    goal: copy.planGoal,
    status: "ACTIVE",
    periodWeeks: activeDistance.weeks,
    startDate: "2026-10-05",
    endDate: new Date(Date.UTC(2026, 9, 5 + activeDistance.weeks * 7 - 1))
      .toISOString()
      .slice(0, 10),
    currentWeekIndex: 4,
    currentDayIndex: 5,
    workouts,
  };
  await page.route("**/*", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      /^\/api\/proxy/,
      "",
    );
    if (path === "/competition-impact/current") {
      return route.fulfill({
        json: {
          data: {
            assessmentId: null,
            status: "SUCCESS",
            cacheHit: true,
            assessedAt: "2026-10-30T03:00:00Z",
            confidence: 1,
            fallbackVersion: null,
            events: [],
            result: {
              eventAssessments: [],
              combinedImpact: {
                overallLevel: "LOW",
                conflicts: [],
                strategySummary: "",
              },
            },
          },
        },
      });
    }
    if (path === `/plans/${planId}`) {
      return route.fulfill({ json: { data: { plan } } });
    }
    if (path === `/plans/${planId}/summary`) {
      return route.fulfill({
        json: {
          data: {
            summary: {
              planId,
              status: "ACTIVE",
              periodWeeks: 8,
              totals: {
                workoutCount: workouts.length,
                doneCount: 10,
                plannedCount: Math.max(0, workouts.length - 11),
                inProgressCount: 0,
                skippedCount: 1,
                movedCount: 0,
                actualLoad: 318,
                estimatedLoad: 354,
                completionRate: 42,
                complianceRate: 90,
              },
              weeks: [],
              bySport: [],
            },
          },
        },
      });
    }
    if (path === "/plans/active") {
      return route.fulfill({ json: { data: { plan } } });
    }
    return route.fallback();
  });

  await page.goto(`/${locale}/plans/${planId}`);
  await expect(page.getByText(copy.planTitle, { exact: true })).toBeVisible();
  await page.addStyleTag({
    content:
      ".tsqd-parent-container,nextjs-portal{display:none!important}.touch-pan-y>div{opacity:1!important;transform:none!important}*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}",
  });
  await page.waitForTimeout(500);
  return { copy, workouts, plan };
}

async function openMarketingHome(
  page: Page,
  locale: CaptureLocale,
  theme: "light" | "dark" = "light",
) {
  const { copy, workouts, plan } = await openMarketingPlan(page, locale, theme);
  const homeWorkouts = workouts.map((workout) => ({
    id: workout.id,
    planId: workout.planId,
    name: workout.name,
    title: workout.name,
    description: workout.notes,
    text: workout.text,
    notes: workout.notes,
    sportType: workout.sportType,
    status: workout.status,
    scheduledDate: workout.scheduledDate.slice(0, 10),
    dayOffset: workout.dayOffset,
    weekIndex: workout.weekIndex,
    dayIndex: workout.dayIndex,
    sessionIndex: workout.sessionIndex,
    linkedActivityTitle: null,
    estimatedLoad: workout.estimatedLoad,
  }));
  const currentWeekWorkouts = homeWorkouts.filter(
    (workout) => workout.weekIndex === plan.currentWeekIndex,
  );
  const todayWorkouts = homeWorkouts.filter(
    (workout) => workout.scheduledDate === "2026-10-30",
  );
  const activity = {
    id: 501,
    hashId: "marketing-morning-run",
    title: copy.recentActivity,
    sportType: "RUN",
    subSportType: "ROAD_RUNNING",
    startTime: "2026-10-28T23:30:00.000Z",
    duration: 1980,
    distance: 5100,
    load: 36,
    status: "READY",
    note: null,
    providers: ["garmin"],
    primaryProvider: "garmin",
    thirdPartyMappings: [],
    mapThumbnailUrl: null,
    mapThumbnailDarkUrl: null,
  };
  const homeResponse = {
    activePlan: {
      id: plan.id,
      title: plan.title,
      description: plan.description,
      goal: plan.goal,
      periodWeeks: plan.periodWeeks,
      startDate: plan.startDate,
      endDate: plan.endDate,
      currentWeekIndex: plan.currentWeekIndex,
      currentDayIndex: plan.currentDayIndex,
      todayWorkouts,
      currentWeekWorkouts,
    },
    recentActivity: activity,
    fitnessStatus: {
      ctl: 52,
      atl: 44,
      tsb: 8,
      acRatio: 0.92,
      monotony: 0.71,
      intensity: 0.74,
      restDays: 1,
      vo2Max: 48,
      thresholdPaceSecPerKm: 282,
    },
    pmcExtremes: { model: "default", ctl: 72, atl: 76 },
    profile: {
      maxHeartRate: 190,
      restingHeartRate: 48,
      ftp: 280,
      cp: 320,
      tp: 3.55,
      cs: 3.42,
      lthr: 171,
      ftpSport: "CYCLING",
      cpSport: "CYCLING",
      tpSport: "RUN",
      csSport: "RUN",
      timezone: "Asia/Shanghai",
    },
    weather: {
      status: "available",
      summary: "18°C",
      temperatureC: 18,
      feelsLikeC: 18,
      precipitationProbability: 10,
      windKph: 8,
      airQuality: null,
    },
    aiTodaySuggestion: {
      summary: copy.todayAdvice,
      tags: copy.todayTags,
      source: "cache",
      shouldRefresh: false,
      generatedAt: "2026-10-30T02:55:00.000Z",
      tone: "success",
    },
  };

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\/proxy/, "");
    if (url.pathname === "/api/v2/home") {
      return route.fulfill({ json: homeResponse });
    }
    if (url.pathname === "/api/v2/activities/feed") {
      return route.fulfill({
        json: {
          items: [activity],
          page: 1,
          perPage: 5,
          total: 1,
          totalPages: 1,
          summary: { count: 1, totalDistance: 5100, totalLoad: 36 },
        },
      });
    }
    if (path === "/charts/summary/week-pair") {
      return route.fulfill({
        json: {
          data: {
            weekPressure: { current: 88, previous: 76 },
            weekCount: { current: 2, previous: 3 },
            weekDuration: { current: 3600, previous: 5400 },
            weekDistance: { current: 9100, previous: 14200 },
            weekSpeed: { current: 2.53, previous: 2.63 },
            weekPower: { current: 0, previous: 0 },
            weekHeartRate: { current: 146, previous: 143 },
            weekClimb: { current: 42, previous: 65 },
            weekCalories: { current: 690, previous: 1010 },
          },
        },
      });
    }
    if (path === "/pmc/data") {
      return route.fulfill({
        json: {
          data: currentWeekWorkouts.map((workout, index) => ({
            date: workout.scheduledDate,
            value: index < 2 ? 32 + index * 8 : 0,
            fitness: 50 + index,
            fatigue: 45 + index,
            form: 5,
          })),
        },
      });
    }
    if (path === "/pmc/status") {
      return route.fulfill({ json: { data: homeResponse.fitnessStatus } });
    }
    if (path === "/pmc/extremes") {
      return route.fulfill({ json: { data: homeResponse.pmcExtremes } });
    }
    if (path === "/ai/today-suggestion") {
      return route.fulfill({ json: { data: homeResponse.aiTodaySuggestion } });
    }
    return route.fallback();
  });

  await page.goto(`/${locale}`);
  // 首页带有服务端初始数据；在截图环境中显式触发一次前台刷新，
  // 让 React Query 用上面拦截的确定性首页数据替换 SSR 空状态。
  await page.clock.setFixedTime(new Date("2026-10-30T03:00:11Z"));
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByText(copy.planTitle, { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(copy.todayAdvice, { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.addStyleTag({
    content:
      ".tsqd-parent-container,nextjs-portal{display:none!important}*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}",
  });
  await page.waitForTimeout(800);
  return { copy };
}

const outputDirectory = resolve(
  process.cwd(),
  selfHostReadmeCapture
    ? "../docs/public/readme"
    : `../docs/public/${activeDistance.directory}`,
);
mkdirSync(outputDirectory, { recursive: true });

function assetLocale(locale: CaptureLocale) {
  return locale.toLowerCase();
}

for (const locale of captureLocales) {
  for (const theme of ["light", "dark"] as const) {
    test(`capture the real ${theme} Web home with deterministic ${marketingDistance} data · ${locale}`, async ({
      page,
    }) => {
      await openMarketingHome(page, locale, theme);
      if (theme === "dark") {
        await expect(page.locator("html")).toHaveClass(/dark/);
      }
      await page.screenshot({
        path: resolve(
          outputDirectory,
          `web-home${theme === "dark" ? "-dark" : ""}-v2-${assetLocale(locale)}.png`,
        ),
        fullPage: false,
      });
    });
  }

  test(`capture the real Web plan page with deterministic ${marketingDistance} data · ${locale}`, async ({
    page,
  }) => {
    await openMarketingPlan(page, locale);
    await page.screenshot({
      path: resolve(outputDirectory, `web-plan-v2-${assetLocale(locale)}.png`),
      fullPage: false,
    });
  });

  test(`capture the real dark Web plan page with deterministic ${marketingDistance} data · ${locale}`, async ({
    page,
  }) => {
    await openMarketingPlan(page, locale, "dark");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.screenshot({
      path: resolve(
        outputDirectory,
        `web-plan-dark-v2-${assetLocale(locale)}.png`,
      ),
      fullPage: false,
    });
  });

  for (const theme of ["light", "dark"] as const) {
    test(`capture the real ${theme} Web calendar with deterministic ${marketingDistance} data · ${locale}`, async ({
      page,
    }) => {
      const { copy, workouts } = await openMarketingPlan(page, locale, theme);
      await page.route("**/*", async (route) => {
        const path = new URL(route.request().url()).pathname.replace(
          /^\/api\/proxy/,
          "",
        );
        if (path === "/plans/scheduled-workouts") {
          return route.fulfill({
            json: {
              data: {
                inPlan: workouts.map((workout) => ({
                  ...workout,
                  scheduledDate: workout.scheduledDate.slice(0, 10),
                })),
                independent: [],
              },
            },
          });
        }
        if (path === "/pmc/data") {
          return route.fulfill({
            json: {
              data: workouts.slice(0, 12).map((workout, index) => ({
                date: workout.scheduledDate,
                value: 28 + index * 3,
                fitness: 42 + index,
                fatigue: 48 + index,
                form: -6,
              })),
            },
          });
        }
        if (path === "/activities") {
          return route.fulfill({
            json: { data: { activities: [], total: 0 } },
          });
        }
        if (path === "/competition-events") {
          return route.fulfill({ json: { data: { events: [] } } });
        }
        return route.fallback();
      });

      await page.goto(`/${locale}/calendar`);
      await expect(
        page
          .getByText(`${copy.workoutNames[2]} · ${copy.week(4)}`, {
            exact: true,
          })
          .first(),
      ).toBeVisible({ timeout: 30_000 });
      await page.addStyleTag({
        content:
          ".tsqd-parent-container,nextjs-portal{display:none!important}.touch-pan-y>div{opacity:1!important;transform:none!important}*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}",
      });
      await page.waitForTimeout(500);
      if (theme === "dark") {
        await expect(page.locator("html")).toHaveClass(/dark/);
      }
      await page.screenshot({
        path: resolve(
          outputDirectory,
          `web-calendar${theme === "dark" ? "-dark" : ""}-v2-${assetLocale(locale)}.png`,
        ),
        fullPage: false,
      });
    });
  }

  test(`capture the real Web coach with deterministic ${marketingDistance} context · ${locale}`, async ({
    page,
  }) => {
    const copy = captureCopy[locale];
    await page.clock.setFixedTime(new Date("2026-10-30T03:00:00Z"));
    await openCoachFixture(
      page,
      [
        {
          id: "marketing-coach-user",
          role: "user",
          content: copy.coachQuestion,
          createdAt: "2026-10-30T03:00:00.000Z",
        },
        {
          id: "marketing-coach-assistant",
          role: "assistant",
          content: copy.coachAnswer,
          createdAt: "2026-10-30T03:01:00.000Z",
        },
      ],
      {
        readyText: copy.coachAnswer,
        sessions: fixtureSessions(locale),
        ...fixtureIdentity(locale),
      },
    );
    if (locale !== "zh") {
      await page.goto(`/${locale}/ai-coach?sid=coach-stream-fixture`);
      await expect(
        page.getByText(copy.coachAnswer, { exact: true }).first(),
      ).toBeVisible();
    }
    await page.addStyleTag({
      content:
        ".tsqd-parent-container,nextjs-portal{display:none!important}*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}",
    });
    await page.screenshot({
      path: resolve(outputDirectory, `web-coach-v2-${assetLocale(locale)}.png`),
      fullPage: false,
    });
  });

  test(`capture the real dark Web coach with deterministic ${marketingDistance} context · ${locale}`, async ({
    page,
  }) => {
    const copy = captureCopy[locale];
    await page.clock.setFixedTime(new Date("2026-10-30T03:00:00Z"));
    await page.addInitScript(() => {
      localStorage.setItem("theme", "dark");
    });
    await openCoachFixture(
      page,
      [
        {
          id: "marketing-coach-user",
          role: "user",
          content: copy.coachQuestion,
          createdAt: "2026-10-30T03:00:00.000Z",
        },
        {
          id: "marketing-coach-assistant",
          role: "assistant",
          content: copy.coachAnswer,
          createdAt: "2026-10-30T03:01:00.000Z",
        },
      ],
      {
        readyText: copy.coachAnswer,
        sessions: fixtureSessions(locale),
        ...fixtureIdentity(locale),
      },
    );
    if (locale !== "zh") {
      await page.goto(`/${locale}/ai-coach?sid=coach-stream-fixture`);
      await expect(
        page.getByText(copy.coachAnswer, { exact: true }).first(),
      ).toBeVisible();
    }
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.addStyleTag({
      content:
        ".tsqd-parent-container,nextjs-portal{display:none!important}*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}",
    });
    await page.screenshot({
      path: resolve(
        outputDirectory,
        `web-coach-dark-v2-${assetLocale(locale)}.png`,
      ),
      fullPage: false,
    });
  });
}
