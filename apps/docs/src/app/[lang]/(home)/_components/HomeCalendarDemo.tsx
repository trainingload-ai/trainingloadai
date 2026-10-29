"use client";

import React from "react";
import dayjs, { type Dayjs } from "dayjs";
import {
  ArrowRight,
  Bike,
  CalendarDays,
  CalendarSync,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FlameKindling,
  Plus,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoWorkoutPlanChart } from "@/components/charts/demo-workout-plan-chart";
import { cn } from "@/lib/utils";

import { useDemoSubView } from "./home-demo/shared/use-demo-sub-view";
import { buildHomeDaySourceCopy } from "./home-day-demo/copy";
import { HomeDayDemoApp } from "./home-day-demo/home-day-demo-app";

import "dayjs/locale/zh-cn";
import "dayjs/locale/ja";

type DemoSport = "RUN" | "CYCLING" | "SWIM";

type DemoStepKind =
  | "WARMUP"
  | "WORK"
  | "RECOVERY"
  | "REST"
  | "COOLDOWN"
  | "OTHER";

type DemoWorkoutStep = {
  duration: number;
  stepKind: DemoStepKind;
  paceKmh?: number;
  powerWatts?: number;
  heartRateBpm?: number;
  durationMeta?: {
    kind: "TIME" | "DISTANCE";
    value: number;
    unit: "SECONDS" | "KILOMETERS" | "METERS";
  };
  primaryTargetMeta?: {
    kind: "SPEED" | "POWER_CUSTOM" | "HEART_RATE_CUSTOM" | "NONE";
    value?: number;
    valueHigh?: number;
    unit?: string;
  } | null;
};

type DemoWorkRestBlock = {
  type: "work" | "rest";
  steps: DemoWorkoutStep[];
};

type DemoRepeatBlock = {
  type: "repeat";
  count: number;
  children: DemoWorkRestBlock[];
};

type DemoParsedPlan = Array<DemoWorkRestBlock | DemoRepeatBlock>;

type DemoActivity = {
  hashId: string;
  date: string;
  activityName: string;
  sportType: DemoSport;
  distanceKm: number;
  durationMinutes: number;
};

type DemoPlanWorkout = {
  id: string;
  date: string;
  name: string;
  notes: string;
  text: string;
  sportType: DemoSport;
  load: number;
  blocks: DemoParsedPlan;
};

type DemoLoadPoint = {
  date: string;
  value: number;
};

type CalendarDemoPayload = {
  month: string;
  today: string;
  selectedDate: string;
  planRange: {
    start: string;
    end: string;
  };
  activities: DemoActivity[];
  workouts: DemoPlanWorkout[];
  dailyLoad: DemoLoadPoint[];
};

type WeekStats = {
  count: number;
  distanceKm: number;
  durationMinutes: number;
  tss: number;
};

type SummaryScope = {
  key: "plan" | "month";
  title: string;
  comparisonLabel: string;
  stats: WeekStats;
  comparisonStats: WeekStats;
};

type CalendarDemoCopy = {
  overview: {
    title: string;
    cycle: string;
    weekLabel: string;
    targetLoadLabel: string;
    targetLoadValue: string;
    completedLabel: string;
    completedValue: string;
    driftLabel: string;
    driftValue: string;
    syncLabel: string;
  };
  monthModeLabel: string;
  weekModeLabel: string;
  today: string;
  addButton: string;
  calendarSubscriptionButton: string;
  viewDay: string;
  selectedDateLabel: string;
  loadLabel: string;
  activityTab: string;
  trainingTab: string;
  planCycleLabel: string;
  planWorkoutCount: (count: number) => string;
  noPlannedTraining: string;
  noActivities: string;
  summaryScope: {
    plan: string;
    month: string;
  };
  planProgressTitle: string;
  monthOverview: string;
  comparisonLabelPlan: string;
  comparisonLabelMonth: string;
  delta: {
    up: string;
    down: string;
    flat: string;
  };
  summary: {
    count: string;
    tss: string;
    distance: string;
    duration: string;
  };
  workoutMeta: {
    duration: string;
    steps: string;
    repeats: string;
    parsed: string;
  };
  sportLabels: Record<DemoSport, string>;
  workoutNames: {
    easyRun: string;
    tempoRun: string;
    strength: string;
    longRun: string;
    recoveryRide: string;
    swim: string;
  };
  workoutNotes: {
    easyRun: string;
    tempoRun: string;
    strength: string;
    longRun: string;
    recoveryRide: string;
    swim: string;
  };
  activityNames: {
    easyRun: string;
    tempoRun: string;
    longRun: string;
    ride: string;
  };
  distanceUnit: string;
  minuteUnit: string;
};

const copyByLang: Record<"en" | "zh" | "zh-hant" | "ja", CalendarDemoCopy> = {
  en: {
    overview: {
      title: "Current plan",
      cycle: "Marathon Base Block",
      weekLabel: "Week 5 / 12",
      targetLoadLabel: "Target",
      targetLoadValue: "420",
      completedLabel: "Completed",
      completedValue: "248",
      driftLabel: "Vs last week",
      driftValue: "+17",
      syncLabel: "Synced",
    },
    monthModeLabel: "Month overview",
    weekModeLabel: "Week focus",
    today: "Today",
    addButton: "Add",
    calendarSubscriptionButton: "Subscribe",
    viewDay: "View day",
    selectedDateLabel: "Selected date",
    loadLabel: "Load",
    activityTab: "Activity",
    trainingTab: "Training",
    planCycleLabel: "Training block",
    planWorkoutCount: (count) =>
      count === 1 ? "1 planned session" : `${count} planned sessions`,
    noPlannedTraining: "No planned training",
    noActivities: "No completed activity",
    summaryScope: {
      plan: "Plan",
      month: "Month",
    },
    planProgressTitle: "Plan progress",
    monthOverview: "Month overview",
    comparisonLabelPlan: "vs previous block",
    comparisonLabelMonth: "vs last month",
    delta: {
      up: "up",
      down: "down",
      flat: "flat",
    },
    summary: {
      count: "Sessions",
      tss: "TSS",
      distance: "Distance",
      duration: "Duration",
    },
    workoutMeta: {
      duration: "Duration",
      steps: "Steps",
      repeats: "Repeat",
      parsed: "Parsed DSL",
    },
    sportLabels: {
      RUN: "Run",
      CYCLING: "Ride",
      SWIM: "Swim",
    },
    workoutNames: {
      easyRun: "Easy run 45 min",
      tempoRun: "Steady run 35 min",
      strength: "Strength activation 20 min",
      longRun: "Long run 90 min",
      recoveryRide: "Recovery ride 50 min",
      swim: "Technique swim 1.6 km",
    },
    workoutNotes: {
      easyRun: "Z2 aerobic volume",
      tempoRun: "Steady aerobic control",
      strength: "Mobility and activation",
      longRun: "Long endurance",
      recoveryRide: "Low-intensity spin",
      swim: "Technique focus",
    },
    activityNames: {
      easyRun: "Easy run",
      tempoRun: "Steady aerobic run",
      longRun: "Long run",
      ride: "Recovery ride",
    },
    distanceUnit: "km",
    minuteUnit: "min",
  },
  zh: {
    overview: {
      title: "当前计划",
      cycle: "马拉松基础周期",
      weekLabel: "第 5 / 12 周",
      targetLoadLabel: "目标",
      targetLoadValue: "420",
      completedLabel: "已完成",
      completedValue: "248",
      driftLabel: "较上周",
      driftValue: "+17",
      syncLabel: "已同步",
    },
    monthModeLabel: "月历概览",
    weekModeLabel: "本周聚焦",
    today: "今天",
    addButton: "添加",
    calendarSubscriptionButton: "订阅",
    viewDay: "查看当天",
    selectedDateLabel: "选中日期",
    loadLabel: "负荷",
    activityTab: "活动",
    trainingTab: "训练",
    planCycleLabel: "训练周期",
    planWorkoutCount: (count) => `${count} 个计划训练`,
    noPlannedTraining: "暂无计划训练",
    noActivities: "暂无已完成活动",
    summaryScope: {
      plan: "计划",
      month: "月份",
    },
    planProgressTitle: "计划进度",
    monthOverview: "本月概览",
    comparisonLabelPlan: "较前一周期",
    comparisonLabelMonth: "较上月",
    delta: {
      up: "上升",
      down: "下降",
      flat: "持平",
    },
    summary: {
      count: "训练次数",
      tss: "TSS",
      distance: "距离",
      duration: "时长",
    },
    workoutMeta: {
      duration: "时长",
      steps: "步骤",
      repeats: "重复",
      parsed: "已解析 DSL",
    },
    sportLabels: {
      RUN: "跑步",
      CYCLING: "骑行",
      SWIM: "游泳",
    },
    workoutNames: {
      easyRun: "轻松跑 45 min",
      tempoRun: "稳态跑 35 min",
      strength: "力量激活 20 min",
      longRun: "长距离跑 90 min",
      recoveryRide: "恢复骑 50 min",
      swim: "技术游 1.6 km",
    },
    workoutNotes: {
      easyRun: "Z2 有氧容量",
      tempoRun: "稳态有氧控制",
      strength: "灵活性与激活",
      longRun: "长距离耐力",
      recoveryRide: "低强度转腿",
      swim: "技术动作",
    },
    activityNames: {
      easyRun: "轻松跑",
      tempoRun: "稳态有氧跑",
      longRun: "长距离跑",
      ride: "恢复骑",
    },
    distanceUnit: "km",
    minuteUnit: "分钟",
  },
  "zh-hant": {
    overview: {
      title: "目前計畫",
      cycle: "馬拉松基礎週期",
      weekLabel: "第 5 / 12 週",
      targetLoadLabel: "目標",
      targetLoadValue: "420",
      completedLabel: "已完成",
      completedValue: "248",
      driftLabel: "較上週",
      driftValue: "+17",
      syncLabel: "已同步",
    },
    monthModeLabel: "月曆概覽",
    weekModeLabel: "本週聚焦",
    today: "今天",
    addButton: "新增",
    calendarSubscriptionButton: "訂閱",
    viewDay: "查看當天",
    selectedDateLabel: "選中日期",
    loadLabel: "負荷",
    activityTab: "活動",
    trainingTab: "訓練",
    planCycleLabel: "訓練週期",
    planWorkoutCount: (count) => `${count} 個計畫訓練`,
    noPlannedTraining: "暫無計畫訓練",
    noActivities: "暫無已完成活動",
    summaryScope: {
      plan: "計畫",
      month: "月份",
    },
    planProgressTitle: "計畫進度",
    monthOverview: "本月概覽",
    comparisonLabelPlan: "較前一週期",
    comparisonLabelMonth: "較上月",
    delta: {
      up: "上升",
      down: "下降",
      flat: "持平",
    },
    summary: {
      count: "訓練次數",
      tss: "TSS",
      distance: "距離",
      duration: "時長",
    },
    workoutMeta: {
      duration: "時長",
      steps: "步驟",
      repeats: "重複",
      parsed: "已解析 DSL",
    },
    sportLabels: {
      RUN: "跑步",
      CYCLING: "騎行",
      SWIM: "游泳",
    },
    workoutNames: {
      easyRun: "輕鬆跑 45 min",
      tempoRun: "穩態跑 35 min",
      strength: "力量啟動 20 min",
      longRun: "長距離跑 90 min",
      recoveryRide: "恢復騎 50 min",
      swim: "技術游 1.6 km",
    },
    workoutNotes: {
      easyRun: "Z2 有氧容量",
      tempoRun: "穩態有氧控制",
      strength: "靈活性與啟動",
      longRun: "長距離耐力",
      recoveryRide: "低強度轉腿",
      swim: "技術動作",
    },
    activityNames: {
      easyRun: "輕鬆跑",
      tempoRun: "穩態有氧跑",
      longRun: "長距離跑",
      ride: "恢復騎",
    },
    distanceUnit: "km",
    minuteUnit: "分鐘",
  },
  ja: {
    overview: {
      title: "Current plan",
      cycle: "Marathon Base Block",
      weekLabel: "Week 5 / 12",
      targetLoadLabel: "Target",
      targetLoadValue: "420",
      completedLabel: "Completed",
      completedValue: "248",
      driftLabel: "Vs last week",
      driftValue: "+17",
      syncLabel: "Synced",
    },
    monthModeLabel: "Month overview",
    weekModeLabel: "Week focus",
    today: "今日",
    addButton: "追加",
    calendarSubscriptionButton: "購読",
    viewDay: "View day",
    selectedDateLabel: "選択日",
    loadLabel: "負荷",
    activityTab: "活動",
    trainingTab: "トレーニング",
    planCycleLabel: "トレーニングブロック",
    planWorkoutCount: (count) => `${count} 件の予定`,
    noPlannedTraining: "予定トレーニングなし",
    noActivities: "完了した活動なし",
    summaryScope: {
      plan: "計画",
      month: "月",
    },
    planProgressTitle: "計画進捗",
    monthOverview: "月間概要",
    comparisonLabelPlan: "前ブロック比",
    comparisonLabelMonth: "前月比",
    delta: {
      up: "増加",
      down: "減少",
      flat: "横ばい",
    },
    summary: {
      count: "回数",
      tss: "TSS",
      distance: "距離",
      duration: "時間",
    },
    workoutMeta: {
      duration: "Duration",
      steps: "Steps",
      repeats: "Repeat",
      parsed: "Parsed DSL",
    },
    sportLabels: {
      RUN: "ラン",
      CYCLING: "ライド",
      SWIM: "スイム",
    },
    workoutNames: {
      easyRun: "イージーラン 45 min",
      tempoRun: "ステディラン 35 min",
      strength: "筋力アクティベーション 20 min",
      longRun: "ロングラン 90 min",
      recoveryRide: "リカバリーライド 50 min",
      swim: "テクニックスイム 1.6 km",
    },
    workoutNotes: {
      easyRun: "Z2 有酸素ボリューム",
      tempoRun: "安定した有酸素コントロール",
      strength: "モビリティと起動",
      longRun: "長時間の持久力",
      recoveryRide: "低強度スピン",
      swim: "フォーム重視",
    },
    activityNames: {
      easyRun: "イージーラン",
      tempoRun: "ステディ有酸素ラン",
      longRun: "ロングラン",
      ride: "リカバリーライド",
    },
    distanceUnit: "km",
    minuteUnit: "分",
  },
};

function getCopy(lang: string): CalendarDemoCopy {
  if (lang === "zh-hant") return copyByLang["zh-hant"];
  if (lang === "ja") return copyByLang.ja;
  if (lang.startsWith("zh")) return copyByLang.zh;
  return copyByLang.en;
}

function getIntlLocale(lang: string) {
  if (lang === "zh-hant") return "zh-Hant";
  if (lang === "pt-BR") return "pt-BR";
  return lang || "en";
}

function getDayjsLocale(lang: string) {
  if (lang.startsWith("zh")) return "zh-cn";
  if (lang === "ja") return "ja";
  return "en";
}

function parseClockToSeconds(token: string) {
  const parts = token.split(":").map((item) => Number(item));
  if (parts.some((item) => Number.isNaN(item))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function parseDurationToken(token: string): DemoWorkoutStep["durationMeta"] & {
  duration: number;
} {
  const timeMatch = token.match(
    /^(\d+)(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours)$/i,
  );
  if (timeMatch) {
    const value = Number(timeMatch[1]);
    const unit = timeMatch[2].toLowerCase();
    const seconds =
      unit === "h" ||
      unit === "hr" ||
      unit === "hrs" ||
      unit === "hour" ||
      unit === "hours"
        ? value * 3600
        : unit === "m" ||
            unit === "min" ||
            unit === "mins" ||
            unit === "minute" ||
            unit === "minutes"
          ? value * 60
          : value;

    return {
      duration: seconds,
      kind: "TIME",
      value: seconds,
      unit: "SECONDS",
    };
  }

  const distanceMatch = token.match(/^(\d+(?:\.\d+)?)(km|m)$/i);
  if (distanceMatch) {
    const value = Number(distanceMatch[1]);
    const unit = distanceMatch[2].toLowerCase();
    const kilometers = unit === "km" ? value : value / 1000;
    return {
      duration: Math.max(60, Math.round(kilometers * 300)),
      kind: "DISTANCE",
      value: unit === "km" ? value : value * 1000,
      unit: unit === "km" ? "KILOMETERS" : "METERS",
    };
  }

  return {
    duration: 60,
    kind: "TIME",
    value: 60,
    unit: "SECONDS",
  };
}

function stepKindFromToken(token: string): DemoStepKind {
  switch (token.toLowerCase()) {
    case "warmup":
      return "WARMUP";
    case "recovery":
      return "RECOVERY";
    case "rest":
      return "REST";
    case "cooldown":
      return "COOLDOWN";
    case "other":
      return "OTHER";
    case "work":
    default:
      return "WORK";
  }
}

function blockTypeForStepKind(
  stepKind: DemoStepKind,
): DemoWorkRestBlock["type"] {
  return stepKind === "RECOVERY" || stepKind === "REST" ? "rest" : "work";
}

function paceRangeToKmh(rangeToken: string) {
  const [lowToken, highToken] = rangeToken.split("-");
  const low = parseClockToSeconds(lowToken);
  const high = parseClockToSeconds(highToken ?? lowToken);
  const values = [low, high].filter((item): item is number =>
    Number.isFinite(item as number),
  );
  if (!values.length) return undefined;
  const avgSeconds =
    values.reduce((sum, item) => sum + item, 0) / values.length;
  return Number((3600 / avgSeconds).toFixed(3));
}

function parseDemoWorkoutStep(rawLine: string, sportType: DemoSport) {
  const line = rawLine.replace(/^(\w+):/, "$1").trim();
  const tokens = line.split(/\s+/).filter(Boolean);
  const stepKind = stepKindFromToken(tokens[0] || "work");
  const duration = parseDurationToken(tokens[1] || "60s");
  const step: DemoWorkoutStep = {
    duration: duration.duration,
    stepKind,
    durationMeta: {
      kind: duration.kind,
      value: duration.value,
      unit: duration.unit,
    },
    primaryTargetMeta: { kind: "NONE" },
  };

  const paceIndex = tokens.findIndex((token) => token.toLowerCase() === "pace");
  if (paceIndex >= 0 && tokens[paceIndex + 1]) {
    const paceKmh = paceRangeToKmh(tokens[paceIndex + 1]);
    if (typeof paceKmh === "number") {
      step.paceKmh = paceKmh;
      step.primaryTargetMeta = {
        kind: "SPEED",
        value: paceKmh,
        valueHigh: paceKmh,
        unit: sportType === "SWIM" ? "sec/100m" : "sec/km",
      };
    }
  }

  const powerIndex = tokens.findIndex(
    (token) => token.toLowerCase() === "power",
  );
  if (powerIndex >= 0 && tokens[powerIndex + 1]) {
    const watts = Number(tokens[powerIndex + 1].replace(/w$/i, ""));
    if (Number.isFinite(watts)) {
      step.powerWatts = watts;
      step.primaryTargetMeta = {
        kind: "POWER_CUSTOM",
        value: watts,
        valueHigh: watts,
        unit: "W",
      };
    }
  }

  const hrIndex = tokens.findIndex((token) => token.toLowerCase() === "hr");
  if (hrIndex >= 0 && tokens[hrIndex + 1]) {
    const bpm = Number(tokens[hrIndex + 1].replace(/[<>=bpm]/gi, ""));
    if (Number.isFinite(bpm)) {
      step.heartRateBpm = bpm;
      step.primaryTargetMeta = {
        kind: "HEART_RATE_CUSTOM",
        value: bpm,
        valueHigh: bpm,
        unit: "bpm",
      };
    }
  }

  return {
    type: blockTypeForStepKind(stepKind),
    steps: [step],
  } satisfies DemoWorkRestBlock;
}

function parseDemoWorkoutDsl(
  text: string,
  sportType: DemoSport,
): DemoParsedPlan {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const blocks: DemoParsedPlan = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const repeatMatch = line.match(/^repeat\s+(\d+)\s*\{$/i);
    if (repeatMatch) {
      const children: DemoWorkRestBlock[] = [];
      index += 1;
      while (index < lines.length && lines[index] !== "}") {
        children.push(parseDemoWorkoutStep(lines[index], sportType));
        index += 1;
      }
      blocks.push({
        type: "repeat",
        count: Number(repeatMatch[1]),
        children,
      });
      continue;
    }

    if (line !== "}") {
      blocks.push(parseDemoWorkoutStep(line, sportType));
    }
  }

  return blocks;
}

function createDemoPlanWorkout(args: Omit<DemoPlanWorkout, "blocks">) {
  return {
    ...args,
    blocks: parseDemoWorkoutDsl(args.text, args.sportType),
  } satisfies DemoPlanWorkout;
}

function buildCalendarDemoPayload(lang: string): CalendarDemoPayload {
  const copy = getCopy(lang);

  return {
    month: "2026-06-01",
    today: "2026-06-17",
    selectedDate: "2026-06-17",
    planRange: {
      start: "2026-06-02",
      end: "2026-06-29",
    },
    workouts: [
      createDemoPlanWorkout({
        id: "workout-0603",
        date: "2026-06-03",
        name: copy.workoutNames.easyRun,
        notes: copy.workoutNotes.easyRun,
        text: [
          "warmup 8m pace 6:00-6:20",
          "work 30m pace 5:35-5:55",
          "cooldown 7m pace 6:10-6:30",
        ].join("\n"),
        sportType: "RUN",
        load: 42,
      }),
      createDemoPlanWorkout({
        id: "workout-0608",
        date: "2026-06-08",
        name: copy.workoutNames.recoveryRide,
        notes: copy.workoutNotes.recoveryRide,
        text: [
          "warmup 10m power 120W",
          "work 35m power 145W",
          "cooldown 5m power 110W",
        ].join("\n"),
        sportType: "CYCLING",
        load: 36,
      }),
      createDemoPlanWorkout({
        id: "workout-0612",
        date: "2026-06-12",
        name: copy.workoutNames.swim,
        notes: copy.workoutNotes.swim,
        text: [
          "warmup 400m pace 2:10-2:20",
          "repeat 4 {",
          "  work 200m pace 1:50-1:58",
          "  recovery 45s",
          "}",
          "cooldown 200m pace 2:20-2:35",
        ].join("\n"),
        sportType: "SWIM",
        load: 54,
      }),
      createDemoPlanWorkout({
        id: "workout-0615",
        date: "2026-06-15",
        name: copy.workoutNames.easyRun,
        notes: copy.workoutNotes.easyRun,
        text: [
          "warmup 8m pace 6:05-6:25",
          "work 32m pace 5:35-5:55",
          "cooldown 5m pace 6:15-6:35",
        ].join("\n"),
        sportType: "RUN",
        load: 42,
      }),
      createDemoPlanWorkout({
        id: "workout-0617-main",
        date: "2026-06-17",
        name: copy.workoutNames.tempoRun,
        notes: copy.workoutNotes.tempoRun,
        text: [
          "warmup 8m pace 5:45-6:05",
          "repeat 3 {",
          "  work 6m pace 4:42-4:52",
          "  recovery 2m pace 6:15-6:45",
          "}",
          "cooldown 7m pace 6:05-6:30",
        ].join("\n"),
        sportType: "RUN",
        load: 88,
      }),
      createDemoPlanWorkout({
        id: "workout-0617-strength",
        date: "2026-06-17",
        name: copy.workoutNames.strength,
        notes: copy.workoutNotes.strength,
        text: [
          "warmup 5m hr 120bpm",
          "repeat 4 {",
          "  work 45s power 260W",
          "  recovery 75s hr 120bpm",
          "}",
          "cooldown 5m hr 115bpm",
        ].join("\n"),
        sportType: "RUN",
        load: 18,
      }),
      createDemoPlanWorkout({
        id: "workout-0620",
        date: "2026-06-20",
        name: copy.workoutNames.longRun,
        notes: copy.workoutNotes.longRun,
        text: [
          "warmup 10m pace 6:00-6:20",
          "work 70m pace 5:25-5:45",
          "cooldown 10m pace 6:10-6:35",
        ].join("\n"),
        sportType: "RUN",
        load: 116,
      }),
      createDemoPlanWorkout({
        id: "workout-0624",
        date: "2026-06-24",
        name: copy.workoutNames.tempoRun,
        notes: copy.workoutNotes.tempoRun,
        text: [
          "warmup 8m pace 5:50-6:10",
          "work 25m pace 4:55-5:05",
          "cooldown 7m pace 6:10-6:30",
        ].join("\n"),
        sportType: "RUN",
        load: 72,
      }),
      createDemoPlanWorkout({
        id: "workout-0627",
        date: "2026-06-27",
        name: copy.workoutNames.easyRun,
        notes: copy.workoutNotes.easyRun,
        text: [
          "warmup 8m pace 6:05-6:25",
          "work 32m pace 5:40-6:00",
          "cooldown 5m pace 6:15-6:35",
        ].join("\n"),
        sportType: "RUN",
        load: 45,
      }),
    ],
    activities: [
      {
        hashId: "act-0603",
        date: "2026-06-03",
        activityName: copy.activityNames.easyRun,
        sportType: "RUN",
        distanceKm: 8.2,
        durationMinutes: 46,
      },
      {
        hashId: "act-0608",
        date: "2026-06-08",
        activityName: copy.activityNames.ride,
        sportType: "CYCLING",
        distanceKm: 24.6,
        durationMinutes: 52,
      },
      {
        hashId: "act-0612",
        date: "2026-06-12",
        activityName: copy.activityNames.easyRun,
        sportType: "RUN",
        distanceKm: 7.4,
        durationMinutes: 41,
      },
      {
        hashId: "act-0615",
        date: "2026-06-15",
        activityName: copy.activityNames.easyRun,
        sportType: "RUN",
        distanceKm: 8.8,
        durationMinutes: 48,
      },
      {
        hashId: "act-0617",
        date: "2026-06-17",
        activityName: copy.activityNames.tempoRun,
        sportType: "RUN",
        distanceKm: 7.8,
        durationMinutes: 39,
      },
      {
        hashId: "act-0620",
        date: "2026-06-20",
        activityName: copy.activityNames.longRun,
        sportType: "RUN",
        distanceKm: 18.6,
        durationMinutes: 96,
      },
    ],
    dailyLoad: [
      { date: "2026-06-03", value: 42 },
      { date: "2026-06-08", value: 64 },
      { date: "2026-06-12", value: 76 },
      { date: "2026-06-15", value: 42 },
      { date: "2026-06-17", value: 88 },
      { date: "2026-06-20", value: 116 },
      { date: "2026-06-24", value: 69 },
      { date: "2026-06-27", value: 45 },
    ],
  };
}

async function fetchCalendarDemoPayload(lang: string) {
  return buildCalendarDemoPayload(lang);
}

function generateCalendarWeeks(month: Dayjs, lang: string): Dayjs[][] {
  const dayjsLocale = getDayjsLocale(lang);
  const firstOfMonth = month.locale(dayjsLocale).startOf("month");
  const calendarStart = firstOfMonth.startOf("week");
  const lastOfMonth = month.locale(dayjsLocale).endOf("month");
  const calendarEnd = lastOfMonth.endOf("week");
  const days: Dayjs[] = [];
  let cursor = calendarStart;

  while (cursor.isBefore(calendarEnd) || cursor.isSame(calendarEnd, "day")) {
    days.push(cursor);
    cursor = cursor.add(1, "day");
  }

  const weeks: Dayjs[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

function groupByDate<T extends { date: string }>(items: T[]) {
  const map: Record<string, T[]> = {};
  for (const item of items) {
    if (!map[item.date]) map[item.date] = [];
    map[item.date].push(item);
  }
  return map;
}

function mapLoadByDate(points: DemoLoadPoint[]) {
  const map: Record<string, number> = {};
  for (const point of points) {
    map[point.date] = point.value;
  }
  return map;
}

function emptyWeekStats(): WeekStats {
  return {
    count: 0,
    distanceKm: 0,
    durationMinutes: 0,
    tss: 0,
  };
}

function buildRangeStats(args: {
  activitiesByDate: Record<string, DemoActivity[]>;
  start: Dayjs;
  end: Dayjs;
  tssByDate: Record<string, number>;
}): WeekStats {
  const { activitiesByDate, start, end, tssByDate } = args;
  const result = emptyWeekStats();
  const totalDays = Math.max(
    end.startOf("day").diff(start.startOf("day"), "day"),
    0,
  );

  for (let i = 0; i <= totalDays; i += 1) {
    const key = start.add(i, "day").format("YYYY-MM-DD");
    const acts = activitiesByDate[key] || [];
    result.count += acts.length;
    result.tss += tssByDate[key] || 0;
    for (const activity of acts) {
      result.distanceKm += activity.distanceKm;
      result.durationMinutes += activity.durationMinutes;
    }
  }

  return result;
}

function useCalendarDemoViewModel(payload: CalendarDemoPayload, lang: string) {
  const [currentMonth, setCurrentMonth] = React.useState(() =>
    dayjs(payload.month).startOf("month"),
  );
  const [selectedDate, setSelectedDate] = React.useState(() =>
    dayjs(payload.selectedDate),
  );

  const weeks = React.useMemo(
    () => generateCalendarWeeks(currentMonth, lang),
    [currentMonth, lang],
  );

  const effectiveSelectedDate = React.useMemo(() => {
    const visible = weeks.flat();
    const inVisibleRange = visible.some((date) =>
      date.isSame(selectedDate, "day"),
    );
    if (inVisibleRange) return selectedDate;
    return currentMonth.isSame(dayjs(payload.today), "month")
      ? dayjs(payload.today)
      : currentMonth.startOf("month");
  }, [currentMonth, payload.today, selectedDate, weeks]);

  const activitiesByDate = React.useMemo(
    () => groupByDate(payload.activities),
    [payload.activities],
  );
  const workoutsByDate = React.useMemo(
    () => groupByDate(payload.workouts),
    [payload.workouts],
  );
  const tssByDate = React.useMemo(
    () => mapLoadByDate(payload.dailyLoad),
    [payload.dailyLoad],
  );
  const range = React.useMemo(
    () => ({
      startOfWeek: dayjs(payload.planRange.start),
      end: dayjs(payload.planRange.end),
    }),
    [payload.planRange.end, payload.planRange.start],
  );

  const selectedDateKey = effectiveSelectedDate.format("YYYY-MM-DD");
  const selectedWeek = React.useMemo(() => {
    return (
      weeks.find((week) =>
        week.some((date) => date.isSame(effectiveSelectedDate, "day")),
      ) ||
      weeks[0] ||
      []
    );
  }, [effectiveSelectedDate, weeks]);

  const planProgressEnd = dayjs(payload.today).isAfter(range.end)
    ? range.end
    : dayjs(payload.today);

  const summaryScopes = React.useMemo(() => {
    const monthStart = currentMonth.startOf("month");
    const monthEnd = currentMonth.endOf("month");
    const previousMonthStart = currentMonth
      .subtract(1, "month")
      .startOf("month");
    const previousMonthEnd = currentMonth.subtract(1, "month").endOf("month");
    const progressDays = Math.max(
      planProgressEnd
        .startOf("day")
        .diff(range.startOfWeek.startOf("day"), "day"),
      0,
    );
    const previousStart = range.startOfWeek.subtract(progressDays + 1, "day");
    const previousEnd = range.startOfWeek.subtract(1, "day");

    return {
      defaultKey: "plan" as const,
      plan: {
        key: "plan" as const,
        title: getCopy(lang).planProgressTitle,
        comparisonLabel: getCopy(lang).comparisonLabelPlan,
        stats: buildRangeStats({
          start: range.startOfWeek,
          end: planProgressEnd,
          activitiesByDate,
          tssByDate,
        }),
        comparisonStats: buildRangeStats({
          start: previousStart,
          end: previousEnd,
          activitiesByDate,
          tssByDate,
        }),
      },
      month: {
        key: "month" as const,
        title: getCopy(lang).monthOverview,
        comparisonLabel: getCopy(lang).comparisonLabelMonth,
        stats: buildRangeStats({
          start: monthStart,
          end: monthEnd,
          activitiesByDate,
          tssByDate,
        }),
        comparisonStats: buildRangeStats({
          start: previousMonthStart,
          end: previousMonthEnd,
          activitiesByDate,
          tssByDate,
        }),
      },
    };
  }, [activitiesByDate, currentMonth, lang, planProgressEnd, range, tssByDate]);

  return {
    currentMonth,
    setCurrentMonth,
    weeks,
    selectedDate: effectiveSelectedDate,
    setSelectedDate,
    selectedWeek,
    selectedActivities: activitiesByDate[selectedDateKey] || [],
    selectedPlanWorkouts: workoutsByDate[selectedDateKey] || [],
    selectedTss: tssByDate[selectedDateKey] || 0,
    activitiesByDate,
    workoutsByDate,
    tssByDate,
    range,
    summaryScopes,
  };
}

function formatDistance(distanceKm: number, copy: CalendarDemoCopy) {
  const value = Number.isInteger(distanceKm)
    ? String(distanceKm)
    : distanceKm.toFixed(1);
  return `${value} ${copy.distanceUnit}`;
}

function formatDuration(durationMinutes: number, copy: CalendarDemoCopy) {
  return `${Math.round(durationMinutes)} ${copy.minuteUnit}`;
}

function getSportAccentClass(type?: DemoSport) {
  switch (type) {
    case "RUN":
      return "bg-rose-500";
    case "CYCLING":
      return "bg-lime-500";
    case "SWIM":
      return "bg-indigo-500";
    default:
      return "bg-slate-400";
  }
}

function getSportTintClass(type?: DemoSport) {
  switch (type) {
    case "RUN":
      return "bg-rose-50 text-rose-700 dark:bg-rose-950/35 dark:text-rose-200";
    case "CYCLING":
      return "bg-lime-50 text-lime-700 dark:bg-lime-950/35 dark:text-lime-200";
    case "SWIM":
      return "bg-sky-50 text-sky-700 dark:bg-sky-950/35 dark:text-sky-200";
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200";
  }
}

function getSportIcon(type?: DemoSport) {
  switch (type) {
    case "CYCLING":
      return Bike;
    case "SWIM":
      return Waves;
    case "RUN":
    default:
      return FlameKindling;
  }
}

function CalendarDemoHeader({
  monthLabel,
  copy,
  onPrev,
  onNext,
  onToday,
}: {
  monthLabel: string;
  copy: CalendarDemoCopy;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 md:flex-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-auto min-w-0 max-w-full rounded-compact p-2 text-left text-md font-semibold tracking-tight"
            >
              <span className="inline-flex min-w-0 items-center gap-1">
                <span className="truncate">{monthLabel}</span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              </span>
            </Button>

            <div className="flex items-center gap-1 rounded-compact bg-background/80">
              <Button variant="ghost" size="icon" onClick={onPrev}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-compact px-2.5 text-xs"
                onClick={onToday}
              >
                {copy.today}
              </Button>
              <Button variant="ghost" size="icon" onClick={onNext}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="hidden min-w-0 items-center justify-between gap-2 md:flex md:shrink-0 md:justify-end">
          <Button variant="outline" size="sm" className="shrink-0 px-2.5">
            <CalendarSync className="size-4" />
            <span className="hidden sm:inline">
              {copy.calendarSubscriptionButton}
            </span>
          </Button>
          <Button size="sm" className="shrink-0 px-2.5 text-xs sm:px-3">
            <Plus className="size-4 shrink-0" />
            {copy.addButton}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CalendarDemoStage({
  currentMonth,
  weeks,
  selectedWeek,
  selectedDate,
  todayDate,
  displayMode,
  copy,
  lang,
  activitiesByDate,
  workoutsByDate,
  tssByDate,
  range,
  onSelectDate,
}: {
  currentMonth: Dayjs;
  weeks: Dayjs[][];
  selectedWeek: Dayjs[];
  selectedDate: Dayjs;
  todayDate: Dayjs;
  displayMode: "week" | "month";
  copy: CalendarDemoCopy;
  lang: string;
  activitiesByDate: Record<string, DemoActivity[]>;
  workoutsByDate: Record<string, DemoPlanWorkout[]>;
  tssByDate: Record<string, number>;
  range: {
    startOfWeek: Dayjs;
    end: Dayjs;
  };
  onSelectDate: (date: Dayjs) => void;
}) {
  const weekdayLabels = React.useMemo(() => {
    const dayjsLocale = getDayjsLocale(lang);
    const start = dayjs().locale(dayjsLocale).startOf("week");
    return Array.from({ length: 7 }, (_, index) =>
      start.add(index, "day").format(lang.startsWith("zh") ? "dd" : "ddd"),
    );
  }, [lang]);

  const visibleWeeks = displayMode === "week" ? [selectedWeek] : weeks;

  return (
    <section className="overflow-hidden rounded-compact bg-neutral-100 p-2.5 dark:bg-muted/45 md:p-3">
      <div className="mb-2">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          {displayMode === "week" ? copy.weekModeLabel : copy.monthModeLabel}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 px-0.5 pb-1.5 md:gap-2">
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className="pb-1 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="space-y-1">
        {visibleWeeks.map((week) => (
          <div
            key={week[0]?.format("YYYY-MM-DD")}
            className="grid grid-cols-7 gap-1 md:gap-2"
          >
            {week.map((date) => {
              const key = date.format("YYYY-MM-DD");
              const inPlanRange = Boolean(
                (date.isSame(range.startOfWeek, "day") ||
                  date.isAfter(range.startOfWeek)) &&
                (date.isSame(range.end, "day") || date.isBefore(range.end)),
              );

              return (
                <CalendarDemoDayButton
                  key={key}
                  date={date}
                  isCurrentMonth={date.month() === currentMonth.month()}
                  isToday={date.isSame(todayDate, "day")}
                  isSelected={date.isSame(selectedDate, "day")}
                  activities={activitiesByDate[key]}
                  planWorkouts={workoutsByDate[key]}
                  tss={tssByDate[key] || 0}
                  inPlanRange={inPlanRange}
                  copy={copy}
                  onSelect={() => onSelectDate(date)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function CalendarDemoDayButton({
  date,
  isCurrentMonth,
  isToday,
  isSelected,
  activities = [],
  planWorkouts = [],
  tss = 0,
  inPlanRange,
  copy,
  onSelect,
}: {
  date: Dayjs;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  activities?: DemoActivity[];
  planWorkouts?: DemoPlanWorkout[];
  tss?: number;
  inPlanRange: boolean;
  copy: CalendarDemoCopy;
  onSelect: () => void;
}) {
  const previewActivities = activities.slice(0, 1);
  const hasPlan = planWorkouts.length > 0;
  const primaryPlanWorkout = planWorkouts[0] ?? null;
  const planTitle =
    primaryPlanWorkout?.notes.trim() ||
    primaryPlanWorkout?.name.trim() ||
    primaryPlanWorkout?.text.trim() ||
    copy.trainingTab;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative flex h-[100px] flex-col items-center rounded-compact p-1 text-center transition-all md:h-[112px] md:items-stretch md:px-2.5 md:py-2 md:text-left",
        "touch-manipulation select-none",
        isSelected
          ? "bg-background text-foreground ring-1 ring-emerald-300/70 dark:bg-neutral-950/90 dark:ring-emerald-700/60"
          : inPlanRange
            ? "bg-emerald-100/75 text-foreground hover:bg-emerald-100/90 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/40"
            : "bg-background/45 text-foreground hover:bg-background/80 dark:bg-neutral-950/25 dark:hover:bg-neutral-950/55",
        !isCurrentMonth && "opacity-35",
      )}
    >
      <div className="relative z-10 flex w-full items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            {date.format("D")}
          </span>
          {isToday ? (
            <span
              className={cn(
                "size-1.5 rounded-full",
                isSelected ? "bg-emerald-500" : "bg-foreground/50",
              )}
            />
          ) : null}
        </div>
        <div className="text-[10px] font-medium tabular-nums text-muted-foreground">
          {tss > 0 ? Math.round(tss) : "--"}
        </div>
      </div>

      <div className="relative z-10 mt-auto flex min-h-1 items-center justify-center gap-1 md:hidden">
        {hasPlan ? (
          <span className="h-1.5 w-4 rounded-full bg-slate-300 opacity-90 dark:bg-slate-700" />
        ) : null}

        {previewActivities.map((activityItem) => (
          <span
            key={activityItem.hashId}
            className={cn(
              "size-1.5 rounded-full opacity-80",
              getSportAccentClass(activityItem.sportType),
            )}
          />
        ))}
      </div>

      <div className="relative z-10 hidden md:flex md:h-full md:flex-col">
        <div className="mt-1 flex flex-1 flex-col gap-1">
          {hasPlan && primaryPlanWorkout ? (
            <div className="border-l-2 border-emerald-500/55 pl-2 text-[11px] font-medium text-muted-foreground">
              <div className="truncate text-foreground/90">
                {copy.sportLabels[primaryPlanWorkout.sportType]} · {planTitle}
              </div>
              {planWorkouts.length > 1 ? (
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  +{planWorkouts.length - 1} {copy.trainingTab}
                </div>
              ) : null}
            </div>
          ) : null}

          {previewActivities.map((activityItem) => (
            <div
              key={activityItem.hashId}
              className="min-w-0 truncate whitespace-nowrap rounded-compact bg-neutral-100 px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors group-hover:bg-neutral-200 dark:bg-muted/45 dark:group-hover:bg-muted"
            >
              {copy.sportLabels[activityItem.sportType]} ·{" "}
              {formatDistance(activityItem.distanceKm, copy)}
            </div>
          ))}
        </div>
      </div>
    </button>
  );
}

function CalendarDemoDaySheet({
  selectedDate,
  tss,
  activities,
  planWorkouts,
  summaryScopes,
  copy,
  lang,
  interactive = false,
  onViewDay,
}: {
  selectedDate: Dayjs;
  tss: number;
  activities: DemoActivity[];
  planWorkouts: DemoPlanWorkout[];
  summaryScopes: {
    defaultKey: "plan" | "month";
    plan: SummaryScope;
    month: SummaryScope;
  };
  copy: CalendarDemoCopy;
  lang: string;
  interactive?: boolean;
  onViewDay?: () => void;
}) {
  const [mobileTab, setMobileTab] = React.useState<"training" | "activity">(
    "training",
  );
  const [summaryScopeKey, setSummaryScopeKey] = React.useState<
    "plan" | "month"
  >(summaryScopes.defaultKey);

  const activeSummaryScope =
    summaryScopeKey === "plan" ? summaryScopes.plan : summaryScopes.month;
  const summaryItems = [
    {
      key: "count",
      label: copy.summary.count,
      value: String(activeSummaryScope.stats.count),
      delta:
        activeSummaryScope.stats.count -
        activeSummaryScope.comparisonStats.count,
    },
    {
      key: "tss",
      label: copy.summary.tss,
      value: String(Math.round(activeSummaryScope.stats.tss)),
      delta: Math.round(
        activeSummaryScope.stats.tss - activeSummaryScope.comparisonStats.tss,
      ),
    },
    {
      key: "distance",
      label: copy.summary.distance,
      value: formatDistance(activeSummaryScope.stats.distanceKm, copy),
      delta:
        activeSummaryScope.stats.distanceKm -
        activeSummaryScope.comparisonStats.distanceKm,
    },
    {
      key: "duration",
      label: copy.summary.duration,
      value: formatDuration(activeSummaryScope.stats.durationMinutes, copy),
      delta:
        activeSummaryScope.stats.durationMinutes -
        activeSummaryScope.comparisonStats.durationMinutes,
    },
  ];

  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-compact">
      <div className="px-3.5 pb-2.5 pt-3 md:px-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
                <CalendarDays className="size-3.5" />
                <span>{copy.selectedDateLabel}</span>
              </div>
              <div className="flex min-w-0 items-baseline gap-2 md:mt-1">
                <div className="text-[24px] font-semibold tracking-tight md:text-[22px]">
                  {selectedDate.format("MM/DD")}
                </div>
                <div className="truncate text-sm text-muted-foreground">
                  {selectedDate.locale(getDayjsLocale(lang)).format("dddd")}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={interactive ? onViewDay : undefined}
              disabled={!interactive || !onViewDay}
              className={cn(
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-compact bg-neutral-100 text-muted-foreground transition-colors dark:bg-muted/45 md:h-auto md:w-auto md:gap-1 md:px-2 md:py-1 md:text-xs md:font-medium",
                interactive && onViewDay
                  ? "cursor-pointer hover:bg-neutral-200 hover:text-foreground dark:hover:bg-muted"
                  : "cursor-default opacity-80",
              )}
              aria-label={copy.viewDay}
            >
              <span className="hidden md:inline">{copy.viewDay}</span>
              <ArrowRight className="size-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-compact bg-muted/55 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.10em] text-muted-foreground">
                {copy.loadLabel}
              </div>
              <div className="mt-0.5 text-sm font-semibold">
                {Math.round(tss)}
              </div>
            </div>
            <div className="rounded-compact bg-muted/55 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.10em] text-muted-foreground">
                {copy.activityTab}
              </div>
              <div className="mt-0.5 text-sm font-semibold">
                {activities.length}
              </div>
            </div>
            {planWorkouts.length > 0 ? (
              <div className="col-span-2 rounded-compact bg-muted/55 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.10em] text-muted-foreground">
                  {copy.planCycleLabel}
                </div>
                <div className="mt-0.5 truncate text-sm font-semibold">
                  {copy.planWorkoutCount(planWorkouts.length)}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-2.5 flex w-full rounded-compact bg-neutral-100 p-1 dark:bg-muted/45">
          <button
            type="button"
            onClick={() => setMobileTab("training")}
            className={cn(
              "flex-1 rounded-compact px-3 py-1.5 text-xs font-medium transition-colors",
              mobileTab === "training"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {copy.trainingTab}
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("activity")}
            className={cn(
              "flex-1 rounded-compact px-3 py-1.5 text-xs font-medium transition-colors",
              mobileTab === "activity"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {copy.activityTab}
          </button>
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 space-y-2 overflow-hidden p-2.5 pt-0">
        {mobileTab === "training" ? (
          <div className="min-w-0 rounded-compact bg-neutral-100 p-2 dark:bg-muted/45">
            {planWorkouts.length > 0 ? (
              <div className="min-w-0 space-y-2">
                {planWorkouts.map((planWorkout) => {
                  const workoutButton = (
                    <DemoWorkoutPlanChartPanel workout={planWorkout} />
                  );

                  if (interactive && onViewDay) {
                    return (
                      <button
                        key={planWorkout.id}
                        type="button"
                        onClick={onViewDay}
                        className="w-full min-w-0 cursor-pointer overflow-hidden rounded-compact border border-border/60 bg-background px-2.5 py-2.5 text-left transition-colors hover:border-border hover:bg-neutral-100 dark:bg-neutral-950 dark:hover:bg-neutral-900"
                      >
                        {workoutButton}
                      </button>
                    );
                  }

                  return (
                    <div
                      key={planWorkout.id}
                      className="w-full min-w-0 overflow-hidden rounded-compact border border-border/60 bg-background px-2.5 py-2.5 text-left dark:bg-neutral-950"
                    >
                      {workoutButton}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-compact bg-background/70 px-3 py-4 text-sm text-muted-foreground">
                {copy.noPlannedTraining}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-compact bg-neutral-100 p-2 dark:bg-muted/45">
            {activities.length === 0 ? (
              <div className="rounded-compact bg-background/70 px-3 py-4 text-sm text-muted-foreground">
                {copy.noActivities}
              </div>
            ) : (
              <div className="space-y-2">
                {activities.map((activityItem) => {
                  const LeadingIcon = getSportIcon(activityItem.sportType);
                  return (
                    <div
                      key={activityItem.hashId}
                      className="flex items-start gap-3 rounded-compact bg-background p-2.5 transition-colors dark:bg-neutral-950"
                    >
                      <div
                        className={cn(
                          "mt-0.5 rounded-compact p-2",
                          getSportTintClass(activityItem.sportType),
                        )}
                      >
                        <LeadingIcon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">
                          {activityItem.activityName}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs opacity-80">
                          <span>
                            {formatDistance(activityItem.distanceKm, copy)}
                          </span>
                          <span>
                            {formatDuration(activityItem.durationMinutes, copy)}
                          </span>
                          <span>
                            {copy.sportLabels[activityItem.sportType]}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="rounded-compact bg-neutral-100 p-2 dark:bg-muted/45">
          <div className="flex items-start justify-between gap-3 px-1 pb-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold">
                {activeSummaryScope.title}
              </div>
            </div>
            <div className="flex shrink-0 rounded-compact bg-background p-0.5 dark:bg-black/20">
              {(["plan", "month"] as const).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => setSummaryScopeKey(scope)}
                  className={cn(
                    "rounded px-2 py-1 text-[11px] font-medium transition-colors",
                    summaryScopeKey === scope
                      ? "bg-neutral-100 text-foreground dark:bg-muted/60"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {scope === "plan"
                    ? copy.summaryScope.plan
                    : copy.summaryScope.month}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {summaryItems.map((item) => (
              <div
                key={item.key}
                className="rounded-compact bg-background px-3 py-2.5 dark:bg-black/20"
              >
                <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {item.label}
                </div>
                <div className="mt-1 text-sm font-semibold">{item.value}</div>
                <div
                  className={cn(
                    "mt-1 text-[10px]",
                    item.delta > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : item.delta < 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground",
                  )}
                >
                  {activeSummaryScope.comparisonLabel}{" "}
                  {item.delta === 0
                    ? copy.delta.flat
                    : item.delta > 0
                      ? copy.delta.up
                      : copy.delta.down}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

type DemoWorkoutSegment = {
  t0: number;
  t1: number;
  displayY: number;
  stepKind: DemoStepKind;
};

function demoStepIntensity(step: DemoWorkoutStep) {
  if (typeof step.powerWatts === "number") {
    return Math.min(
      100,
      Math.max(0, Math.round((step.powerWatts / 360) * 100)),
    );
  }
  if (typeof step.heartRateBpm === "number") {
    return Math.min(
      100,
      Math.max(0, Math.round((step.heartRateBpm / 190) * 100)),
    );
  }
  if (typeof step.paceKmh === "number") {
    return Math.min(
      100,
      Math.max(0, Math.round(((step.paceKmh - 6) / 11) * 100)),
    );
  }

  switch (step.stepKind) {
    case "WARMUP":
    case "COOLDOWN":
      return 34;
    case "WORK":
      return 72;
    case "RECOVERY":
      return 32;
    case "REST":
      return 12;
    case "OTHER":
      return 46;
    default:
      return 52;
  }
}

function flattenDemoWorkoutSegments(plan: DemoParsedPlan) {
  const segments: DemoWorkoutSegment[] = [];
  let elapsed = 0;

  const emitBlock = (block: DemoWorkRestBlock) => {
    for (const step of block.steps) {
      const duration = Math.max(1, step.duration);
      segments.push({
        t0: elapsed,
        t1: elapsed + duration,
        displayY: demoStepIntensity(step),
        stepKind: step.stepKind,
      });
      elapsed += duration;
    }
  };

  for (const item of plan) {
    if (item.type === "repeat") {
      for (let repeatIndex = 0; repeatIndex < item.count; repeatIndex += 1) {
        item.children.forEach(emitBlock);
      }
      continue;
    }

    emitBlock(item);
  }

  return segments;
}

function DemoWorkoutPlanChartPanel({ workout }: { workout: DemoPlanWorkout }) {
  const segments = flattenDemoWorkoutSegments(workout.blocks);

  return (
    <div
      className="relative w-full text-foreground"
      role="img"
      aria-label={workout.name}
    >
      <DemoWorkoutPlanChart segments={segments} />
    </div>
  );
}

export function HomeCalendarDemo({
  lang,
  variant = "preview",
}: {
  lang: string;
  variant?: "preview" | "expanded";
}) {
  const [payload, setPayload] = React.useState<CalendarDemoPayload>(() =>
    buildCalendarDemoPayload(lang),
  );
  const displayMode = "month" as const;
  const [navigationDirection, setNavigationDirection] = React.useState<1 | -1>(
    1,
  );
  const copy = React.useMemo(() => getCopy(lang), [lang]);
  const todayDate = React.useMemo(() => dayjs(payload.today), [payload.today]);
  const {
    currentMonth,
    setCurrentMonth,
    weeks,
    selectedDate,
    setSelectedDate,
    selectedWeek,
    selectedActivities,
    selectedPlanWorkouts,
    selectedTss,
    activitiesByDate,
    workoutsByDate,
    tssByDate,
    range,
    summaryScopes,
  } = useCalendarDemoViewModel(payload, lang);
  const daySheetKey = React.useMemo(
    () =>
      `${selectedDate.format("YYYY-MM-DD")}|${selectedPlanWorkouts.map((w) => w.id).join(",")}|${summaryScopes.defaultKey}`,
    [selectedDate, selectedPlanWorkouts, summaryScopes.defaultKey],
  );

  React.useEffect(() => {
    let ignore = false;

    void fetchCalendarDemoPayload(lang).then((data) => {
      if (!ignore) setPayload(data);
    });

    return () => {
      ignore = true;
    };
  }, [lang]);

  const applySelectedDate = React.useCallback(
    (nextDate: Dayjs) => {
      setSelectedDate(nextDate);
      if (!nextDate.isSame(currentMonth, "month")) {
        setCurrentMonth(nextDate.startOf("month"));
      }
    },
    [currentMonth, setCurrentMonth, setSelectedDate],
  );

  const navigateMonth = React.useCallback(
    (direction: 1 | -1) => {
      setNavigationDirection(direction);
      const targetMonth = currentMonth.add(direction, "month").startOf("month");
      const targetDate = targetMonth.date(
        Math.min(selectedDate.date(), targetMonth.daysInMonth()),
      );
      setCurrentMonth(targetMonth);
      setSelectedDate(targetDate);
    },
    [currentMonth, selectedDate, setCurrentMonth, setSelectedDate],
  );

  const handlePrev = React.useCallback(() => {
    navigateMonth(-1);
  }, [navigateMonth]);

  const handleNext = React.useCallback(() => {
    navigateMonth(1);
  }, [navigateMonth]);

  const handleToday = React.useCallback(() => {
    setNavigationDirection(1);
    setCurrentMonth(todayDate.startOf("month"));
    setSelectedDate(todayDate);
  }, [setCurrentMonth, setSelectedDate, todayDate]);

  const monthLabel = React.useMemo(() => {
    return new Intl.DateTimeFormat(getIntlLocale(lang), {
      year: "numeric",
      month: "long",
    }).format(currentMonth.toDate());
  }, [currentMonth, lang]);
  const isExpanded = variant === "expanded";
  const { view, openDay, goMain } = useDemoSubView({
    lang,
    interactive: isExpanded,
  });
  const [dayDateKey, setDayDateKey] = React.useState(() =>
    selectedDate.format("YYYY-MM-DD"),
  );
  const daySourceCopy = React.useMemo(
    () => buildHomeDaySourceCopy(lang),
    [lang],
  );

  const handleViewDay = React.useCallback(() => {
    setDayDateKey(selectedDate.format("YYYY-MM-DD"));
    openDay();
  }, [openDay, selectedDate]);

  if (view === "day" && isExpanded) {
    return (
      <div
        className="client-demo-radius flex h-full min-h-0 flex-col bg-background p-5 text-foreground"
        data-testid="home-calendar-demo"
        data-demo-mode={variant}
      >
        <HomeDayDemoApp
          key={dayDateKey}
          lang={lang}
          sourceCopy={daySourceCopy}
          initialDateKey={dayDateKey}
          onBackHome={goMain}
        />
      </div>
    );
  }

  if (isExpanded) {
    return (
      <div
        className="client-demo-radius flex h-full min-h-0 flex-col bg-background p-5 text-foreground"
        data-testid="home-calendar-demo"
        data-demo-mode={variant}
      >
        <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.24fr)_minmax(220px,260px)] gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(240px,280px)]">
          <div className="flex min-h-0 flex-col gap-3">
            <CalendarDemoHeader
              monthLabel={monthLabel}
              copy={copy}
              onPrev={handlePrev}
              onNext={handleNext}
              onToday={handleToday}
            />
            <CalendarDemoStage
              currentMonth={currentMonth}
              weeks={weeks}
              selectedWeek={selectedWeek}
              selectedDate={selectedDate}
              todayDate={todayDate}
              displayMode={displayMode}
              copy={copy}
              lang={lang}
              activitiesByDate={activitiesByDate}
              workoutsByDate={workoutsByDate}
              tssByDate={tssByDate}
              range={range}
              onSelectDate={applySelectedDate}
            />
          </div>

          <CalendarDemoDaySheet
            key={daySheetKey}
            selectedDate={selectedDate}
            tss={selectedTss}
            activities={selectedActivities}
            planWorkouts={selectedPlanWorkouts}
            summaryScopes={summaryScopes}
            copy={copy}
            lang={lang}
            interactive={isExpanded}
            onViewDay={handleViewDay}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "client-demo-radius relative overflow-hidden bg-background text-neutral-950 dark:text-white",
        "min-h-[320px] md:min-h-[560px] [--calendar-preview-scale:0.36] md:[--calendar-preview-scale:0.68]",
      )}
      data-testid="home-calendar-demo"
      data-demo-mode={variant}
    >
      <div
        className="absolute left-1/2 top-1/2 h-[820px] w-[1040px] origin-center overflow-hidden bg-background text-foreground"
        style={{
          transform:
            "translate(-50%, -50%) scale(var(--calendar-preview-scale))",
        }}
        data-navigation-direction={navigationDirection}
      >
        <div className="grid h-full min-h-0 grid-cols-[minmax(0,1.24fr)_minmax(220px,260px)] gap-5 bg-background p-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(240px,280px)]">
          <div className="flex min-h-0 flex-col gap-3">
            <CalendarDemoHeader
              monthLabel={monthLabel}
              copy={copy}
              onPrev={handlePrev}
              onNext={handleNext}
              onToday={handleToday}
            />
            <CalendarDemoStage
              currentMonth={currentMonth}
              weeks={weeks}
              selectedWeek={selectedWeek}
              selectedDate={selectedDate}
              todayDate={todayDate}
              displayMode={displayMode}
              copy={copy}
              lang={lang}
              activitiesByDate={activitiesByDate}
              workoutsByDate={workoutsByDate}
              tssByDate={tssByDate}
              range={range}
              onSelectDate={applySelectedDate}
            />
          </div>

          <CalendarDemoDaySheet
            key={daySheetKey}
            selectedDate={selectedDate}
            tss={selectedTss}
            activities={selectedActivities}
            planWorkouts={selectedPlanWorkouts}
            summaryScopes={summaryScopes}
            copy={copy}
            lang={lang}
            interactive={isExpanded}
            onViewDay={handleViewDay}
          />
        </div>
      </div>
    </div>
  );
}
