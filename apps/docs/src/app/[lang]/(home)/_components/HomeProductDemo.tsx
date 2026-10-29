"use client";

import type { ComponentType, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Battery,
  BedDouble,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  Clock3,
  Dumbbell,
  FileUp,
  Flame,
  Heart,
  HeartPulse,
  Link2,
  MessageCircle,
  Route,
  Settings,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveDemoCopy } from "@/lib/demo-i18n";
import { cn } from "@/lib/utils";
import { useHomeDemoLightboxBack } from "./HomeDemoLightbox";
import { MetricHistoryDemoDialog } from "./home-demo/metric-history/metric-history-demo-dialog";
import { buildMetricDocsLink } from "./home-demo/metric-history/demo-fixtures";
import {
  createInitialMetricHistoryDialogState,
  type FitnessMetricKey,
  type MetricHistoryDialogState,
} from "./home-demo/metric-history/types";
import { HomeDayDemoApp } from "./home-day-demo/home-day-demo-app";
import { HomeProductDemoWeeklyLoadChart } from "./home-product-demo-weekly-load-chart";
import { MetricDemoApp } from "./metric-demo/metric-demo-app";
import { metricDemoCopy } from "./metric-demo/copy";
import {
  type MetricDemoView,
  type SummaryMetricKey,
  summaryKeyToView,
} from "./metric-demo/types";

type HomeDemoView = "home" | "day" | MetricDemoView;

type DemoMetric = {
  key: string;
  title: string;
  label: string;
  value: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
};

type FitnessStatCard = {
  key: string;
  title: string;
  value: string;
  unit?: string;
  description: string;
  details?: string;
  percent?: number;
  level?: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
};

type DemoCopy = {
  aboutMetric: string;
  today: {
    title: string;
    date: string;
    isoDate: string;
    weekday: string;
    summary: string;
    tags: string[];
    askCoach: string;
  };
  currentPlan: {
    title: string;
    cycle: string;
    weekTarget: string;
    weekTargetLoad: string;
    weekLabel: string;
    todayFocus: string;
    viewCurrentPlan: string;
  };
  currentState: {
    title: string;
    settingsAria: string;
    settingsTitle: string;
    healthTitle: string;
    restingHeartRate: string;
    maxHeartRate: string;
  };
  fitnessCards: FitnessStatCard[];
  load: {
    weeklyTrainingLoad: string;
    weeklySessionCount: string;
    loadUnit: string;
    goal: string;
    completedLabel: string;
    chartTitle: string;
    actual: string;
    planned: string;
    todayValues: string;
    chartAria: string;
    weekdays: string[];
  };
  summary: {
    title: string;
    description: string;
    metrics: DemoMetric[];
  };
  todayExecution: {
    title: string;
    meta: string;
    isoDate: string;
    enterToday: string;
    workoutTitle: string;
    status: string;
    sport: string;
    duration: string;
    focus: string;
    linked: string;
    actionPostpone: string;
    actionSkip: string;
    actionDelete: string;
    deleteDisabledTip: string;
    session: string;
  };
  recentActivity: {
    titleSection: string;
    items: Array<{
      title: string;
      time: string;
      summary: string;
      status: string;
    }>;
  };
  upload: {
    title: string;
    cardTitle: string;
    description: string;
    selectFile: string;
  };
};

const enCopy: DemoCopy = {
  aboutMetric: "Learn more about {title}",
  today: {
    title: "AI Coach · Today's Suggestion",
    date: "Jun 3",
    isoDate: "2026-06-03",
    weekday: "Wednesday",
    summary:
      "Keep today's tempo run. If the warm-up still feels flat, stay at the low end of the planned intensity and skip any extra volume.",
    tags: ["1 workout", "TSB -4", "Recent activity"],
    askCoach: "Ask AI Coach",
  },
  currentPlan: {
    title: "Current Plan",
    cycle: "Marathon Base Block",
    weekTarget: "Weekly target",
    weekTargetLoad: "5",
    weekLabel: "Week 5 / 12",
    todayFocus: "Tempo run",
    viewCurrentPlan: "View current plan",
  },
  currentState: {
    title: "Current state",
    settingsAria: "Current state settings",
    settingsTitle: "Customize current state",
    healthTitle: "Health",
    restingHeartRate: "Resting heart rate",
    maxHeartRate: "Max heart rate",
  },
  fitnessCards: [
    {
      key: "atl",
      title: "Fatigue",
      value: "76",
      unit: "ATL",
      description: "Acute training load",
      details:
        "ATL reflects short-term fatigue from recent training. Rising ATL usually means you have stacked several hard sessions close together.",
      percent: 76,
      icon: Zap,
      color: "text-violet-500",
      bgColor: "bg-violet-100 dark:bg-violet-900/30",
    },
    {
      key: "ctl",
      title: "Fitness",
      value: "72",
      unit: "CTL",
      description: "Chronic training load",
      details:
        "CTL is a longer-term fitness signal built from sustained training load. It rises slowly with consistent work and falls when you back off.",
      percent: 72,
      icon: Dumbbell,
      color: "text-sky-500",
      bgColor: "bg-sky-100 dark:bg-sky-900/30",
    },
    {
      key: "tsb",
      title: "Form",
      value: "-4",
      unit: "TSB",
      description: "Training stress balance",
      details:
        "TSB compares fitness and fatigue. Negative values suggest you are carrying more fatigue than freshness.",
      percent: 45,
      icon: Battery,
      color: "text-slate-500",
      bgColor: "bg-slate-100 dark:bg-slate-900/30",
    },
    {
      key: "vo2Max",
      title: "VO2 Max",
      value: "54",
      unit: "ml/kg/min",
      description: "Cardiorespiratory fitness",
      details:
        "VO2 Max estimates your aerobic ceiling. In Training Load it is tracked as a trend rather than a single-day spike.",
      level: "Excellent",
      percent: 90,
      icon: Heart,
      color: "text-red-500",
      bgColor: "bg-red-100 dark:bg-red-900/30",
    },
    {
      key: "intensity",
      title: "Training Strain",
      value: "684",
      description: "Load metric",
      details:
        "Training strain summarizes how demanding recent sessions have been relative to your current capacity.",
      icon: Flame,
      color: "text-rose-500",
      bgColor: "bg-rose-100 dark:bg-rose-900/30",
    },
    {
      key: "restDays",
      title: "Suggested Rest",
      value: "1",
      unit: "days",
      description: "Until TSB reaches 0",
      details:
        "Suggested rest estimates how many easier days you may need before fatigue and fitness rebalance around TSB = 0.",
      icon: BedDouble,
      color: "text-indigo-500",
      bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
    },
  ],
  load: {
    weeklyTrainingLoad: "Weekly load",
    weeklySessionCount: "Weekly sessions",
    loadUnit: "Load",
    goal: "Goal",
    completedLabel: "Completed",
    chartTitle: "This week's load",
    actual: "Actual",
    planned: "Planned",
    todayValues: "Today: actual 18 · planned 72",
    chartAria: "Actual and planned training load for this week",
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  },
  summary: {
    title: "Summary",
    description: "Key training signals that shape today's next step.",
    metrics: [
      {
        key: "pmc",
        title: "PMC",
        label: "Load",
        value: "CTL 72 · ATL 76",
        hint: "TSB -4",
        icon: TrendingUp,
      },
      {
        key: "power",
        title: "Power",
        label: "FTP",
        value: "FTP 286W",
        hint: "CP 302W",
        icon: Zap,
      },
      {
        key: "speed",
        title: "Speed",
        label: "Pace",
        value: "TP 4:18/km",
        hint: "CS 4:05/km",
        icon: Route,
      },
      {
        key: "hr",
        title: "Heart Rate",
        label: "BPM",
        value: "Resting 48 bpm",
        hint: "Max 188 bpm",
        icon: HeartPulse,
      },
    ],
  },
  todayExecution: {
    title: "Today's execution",
    meta: "Jun 3 · Wednesday · 1 workout",
    isoDate: "2026-06-03",
    enterToday: "Open today",
    workoutTitle: "Tempo run",
    status: "Planned",
    sport: "Run",
    duration: "52 min",
    focus: "3 x 8 min steady-hard",
    linked: "No linked activity",
    actionPostpone: "Postpone",
    actionSkip: "Skip",
    actionDelete: "Delete",
    deleteDisabledTip: "Completed workouts can be deleted from the plan page.",
    session: "session",
  },
  recentActivity: {
    titleSection: "Recent activities",
    items: [
      {
        title: "Aerobic run",
        time: "06-02 07:42",
        summary: "11.8 km · 62 min",
        status: "Analyzed",
      },
      {
        title: "Endurance ride",
        time: "06-01 18:20",
        summary: "54.2 km · 126 min",
        status: "Synced",
      },
      {
        title: "Pool technique",
        time: "05-31 06:55",
        summary: "2.0 km · 45 min",
        status: "Analyzed",
      },
    ],
  },
  upload: {
    title: "Upload training",
    cardTitle: "Import activity files",
    description: "FIT, GPX, and TCX files can fill gaps in your history.",
    selectFile: "Select file",
  },
};

const zhCopy: DemoCopy = {
  aboutMetric: "了解 {title}",
  today: {
    title: "智能教练今日建议",
    date: "6 月 3 日",
    isoDate: "2026-06-03",
    weekday: "周三",
    summary: "保留节奏跑。如果热身后疲劳上升，就控制强度，保护明天的有氧量。",
    tags: ["1 次训练", "TSB -4", "近期有活动"],
    askCoach: "问智能教练",
  },
  currentPlan: {
    title: "当前计划",
    cycle: "马拉松基础周期",
    weekTarget: "周目标",
    weekTargetLoad: "5",
    weekLabel: "第 5 / 12 周",
    todayFocus: "有氧量为主，保留一次质量训练",
    viewCurrentPlan: "查看当前计划",
  },
  currentState: {
    title: "当前状态",
    settingsAria: "当前状态设置",
    settingsTitle: "自定义当前状态",
    healthTitle: "健康",
    restingHeartRate: "静息心率",
    maxHeartRate: "最大心率",
  },
  fitnessCards: [
    {
      key: "atl",
      title: "疲劳",
      value: "76",
      unit: "ATL",
      description: "急性训练负荷",
      details: "ATL 反映近期训练带来的短期疲劳，连续高强度训练后通常会上升。",
      percent: 76,
      icon: Zap,
      color: "text-violet-500",
      bgColor: "bg-violet-100 dark:bg-violet-900/30",
    },
    {
      key: "ctl",
      title: "体能",
      value: "72",
      unit: "CTL",
      description: "慢性训练负荷",
      details:
        "CTL 反映长期体能积累，需要持续训练才会缓慢上升，停训后会逐渐下降。",
      percent: 72,
      icon: Dumbbell,
      color: "text-sky-500",
      bgColor: "bg-sky-100 dark:bg-sky-900/30",
    },
    {
      key: "tsb",
      title: "状态",
      value: "-4",
      unit: "TSB",
      description: "训练压力平衡",
      details: "TSB 对比体能与疲劳，负值通常表示当前疲劳高于新鲜度。",
      percent: 45,
      icon: Battery,
      color: "text-slate-500",
      bgColor: "bg-slate-100 dark:bg-slate-900/30",
    },
    {
      key: "vo2Max",
      title: "最大摄氧量",
      value: "54",
      unit: "ml/kg/min",
      description: "心肺能力",
      details: "最大摄氧量反映有氧能力上限，更适合看趋势而不是单日波动。",
      level: "极好",
      percent: 90,
      icon: Heart,
      color: "text-red-500",
      bgColor: "bg-red-100 dark:bg-red-900/30",
    },
    {
      key: "intensity",
      title: "训练压力",
      value: "684",
      description: "Training Strain",
      details: "训练压力汇总近期训练强度，帮助你判断当前负荷是否偏高。",
      icon: Flame,
      color: "text-rose-500",
      bgColor: "bg-rose-100 dark:bg-rose-900/30",
    },
    {
      key: "restDays",
      title: "建议休息",
      value: "1",
      unit: "天",
      description: "达到 TSB=0",
      details:
        "建议休息天数估算你需要多少轻松日，才能让疲劳与体能重新接近平衡。",
      icon: BedDouble,
      color: "text-indigo-500",
      bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
    },
  ],
  load: {
    weeklyTrainingLoad: "本周训练负荷",
    weeklySessionCount: "周训练次数",
    loadUnit: "负荷",
    goal: "目标",
    completedLabel: "已完成",
    chartTitle: "本周负荷",
    actual: "实际",
    planned: "计划",
    todayValues: "今日：实际 18 · 计划 72",
    chartAria: "本周实际负荷与计划负荷对比",
    weekdays: ["一", "二", "三", "四", "五", "六", "日"],
  },
  summary: {
    title: "摘要",
    description: "影响今天下一步判断的关键训练信号。",
    metrics: [
      {
        key: "pmc",
        title: "PMC",
        label: "负荷",
        value: "CTL 72 · ATL 76",
        hint: "TSB -4",
        icon: TrendingUp,
      },
      {
        key: "power",
        title: "功率",
        label: "FTP",
        value: "FTP 286W",
        hint: "CP 302W",
        icon: Zap,
      },
      {
        key: "speed",
        title: "速度",
        label: "配速",
        value: "TP 4:18/km",
        hint: "CS 4:05/km",
        icon: Route,
      },
      {
        key: "hr",
        title: "心率",
        label: "BPM",
        value: "静息 48 bpm",
        hint: "最大 188 bpm",
        icon: HeartPulse,
      },
    ],
  },
  todayExecution: {
    title: "今日执行",
    meta: "6 月 3 日 · 周三 · 1 次训练",
    isoDate: "2026-06-03",
    enterToday: "进入今天",
    workoutTitle: "节奏跑",
    status: "计划",
    sport: "跑步",
    duration: "52 分钟",
    focus: "3 x 8 分钟稳定偏强",
    linked: "未关联活动",
    actionPostpone: "推迟",
    actionSkip: "跳过",
    actionDelete: "删除",
    deleteDisabledTip: "已完成训练需要在计划页删除。",
    session: "组",
  },
  recentActivity: {
    titleSection: "最近活动",
    items: [
      {
        title: "有氧跑",
        time: "06-02 07:42",
        summary: "11.8 km · 62 分钟",
        status: "已分析",
      },
      {
        title: "耐力骑行",
        time: "06-01 18:20",
        summary: "54.2 km · 126 分钟",
        status: "已同步",
      },
      {
        title: "泳池技术",
        time: "05-31 06:55",
        summary: "2.0 km · 45 分钟",
        status: "已分析",
      },
    ],
  },
  upload: {
    title: "上传训练",
    cardTitle: "导入活动文件",
    description: "FIT、GPX、TCX 文件可以补齐训练历史。",
    selectFile: "选择文件",
  },
};

type LocalizedFitnessCard = Pick<
  FitnessStatCard,
  "title" | "description" | "details"
> &
  Partial<Pick<FitnessStatCard, "unit" | "level">>;

type LocalizedMetric = Pick<DemoMetric, "title" | "label" | "value" | "hint">;

function createLocalizedDemoCopy({
  base = enCopy,
  fitnessCards,
  summary,
  ...copy
}: Omit<DemoCopy, "fitnessCards" | "summary"> & {
  base?: DemoCopy;
  fitnessCards: LocalizedFitnessCard[];
  summary: Omit<DemoCopy["summary"], "metrics"> & {
    metrics: LocalizedMetric[];
  };
}): DemoCopy {
  return {
    ...base,
    ...copy,
    fitnessCards: base.fitnessCards.map((card, index) => ({
      ...card,
      ...fitnessCards[index],
    })),
    summary: {
      ...summary,
      metrics: base.summary.metrics.map((metric, index) => ({
        ...metric,
        ...summary.metrics[index],
      })),
    },
  };
}

const zhHantCopy = createLocalizedDemoCopy({
  base: zhCopy,
  aboutMetric: "了解 {title}",
  today: {
    title: "智能教練今日建議",
    date: "6 月 3 日",
    isoDate: "2026-06-03",
    weekday: "週三",
    summary:
      "保留節奏跑。如果熱身後疲勞加重，就降低強度，為明天的有氧訓練保留體力。",
    tags: ["1 項訓練", "TSB -4", "近期有活動"],
    askCoach: "詢問智能教練",
  },
  currentPlan: {
    title: "目前計畫",
    cycle: "馬拉松基礎週期",
    weekTarget: "每週目標",
    weekTargetLoad: "5",
    weekLabel: "第 5 / 12 週",
    todayFocus: "以有氧訓練為主，保留一次品質課",
    viewCurrentPlan: "查看目前計畫",
  },
  currentState: {
    title: "目前狀態",
    settingsAria: "目前狀態設定",
    settingsTitle: "自訂目前狀態",
    healthTitle: "健康",
    restingHeartRate: "靜息心率",
    maxHeartRate: "最大心率",
  },
  fitnessCards: [
    {
      title: "疲勞",
      description: "急性訓練負荷",
      details: "ATL 反映近期訓練造成的短期疲勞，連續高強度訓練後通常會上升。",
    },
    {
      title: "體能",
      description: "慢性訓練負荷",
      details: "CTL 反映長期體能累積，持續訓練時會緩慢上升，減量後則逐漸下降。",
    },
    {
      title: "狀態",
      description: "訓練壓力平衡",
      details: "TSB 比較體能與疲勞；負值通常表示目前累積的疲勞較多。",
    },
    {
      title: "最大攝氧量",
      description: "心肺能力",
      details: "最大攝氧量估算有氧能力上限，適合觀察長期趨勢，而非單日波動。",
      level: "極佳",
    },
    {
      title: "訓練壓力",
      description: "負荷指標",
      details: "訓練壓力彙整近期訓練強度，協助判斷負荷是否偏高。",
    },
    {
      title: "建議休息",
      description: "恢復至 TSB=0",
      details: "建議休息天數估算需要多少輕鬆日，才能讓疲勞與體能重新接近平衡。",
      unit: "天",
    },
  ],
  load: {
    weeklyTrainingLoad: "本週訓練負荷",
    weeklySessionCount: "週訓練次數",
    loadUnit: "負荷",
    goal: "目標",
    completedLabel: "已完成",
    chartTitle: "本週負荷",
    actual: "實際",
    planned: "計畫",
    todayValues: "今日：實際 18 · 計畫 72",
    chartAria: "本週實際負荷與計畫負荷比較",
    weekdays: ["一", "二", "三", "四", "五", "六", "日"],
  },
  summary: {
    title: "摘要",
    description: "影響今天下一步判斷的關鍵訓練指標。",
    metrics: [
      { title: "PMC", label: "負荷", value: "CTL 72 · ATL 76", hint: "TSB -4" },
      { title: "功率", label: "FTP", value: "FTP 286W", hint: "CP 302W" },
      { title: "速度", label: "配速", value: "TP 4:18/km", hint: "CS 4:05/km" },
      {
        title: "心率",
        label: "BPM",
        value: "靜息 48 bpm",
        hint: "最大 188 bpm",
      },
    ],
  },
  todayExecution: {
    title: "今日執行",
    meta: "6 月 3 日 · 週三 · 1 項計畫",
    isoDate: "2026-06-03",
    enterToday: "進入今天",
    workoutTitle: "節奏跑",
    status: "計畫",
    sport: "跑步",
    duration: "52 分鐘",
    focus: "3 × 8 分鐘穩定偏強",
    linked: "未關聯活動",
    actionPostpone: "順延",
    actionSkip: "跳過",
    actionDelete: "刪除",
    deleteDisabledTip: "進行中的計畫暫不支援刪除單項訓練。",
    session: "組",
  },
  recentActivity: {
    titleSection: "最近活動",
    items: [
      {
        title: "有氧跑",
        time: "06-02 07:42",
        summary: "11.8 km · 62 分鐘",
        status: "已分析",
      },
      {
        title: "耐力騎行",
        time: "06-01 18:20",
        summary: "54.2 km · 126 分鐘",
        status: "已同步",
      },
      {
        title: "泳池技巧",
        time: "05-31 06:55",
        summary: "2.0 km · 45 分鐘",
        status: "已分析",
      },
    ],
  },
  upload: {
    title: "上傳活動",
    cardTitle: "匯入活動檔案",
    description: "匯入 FIT、GPX 或 TCX 檔案，補齊訓練紀錄。",
    selectFile: "選擇檔案",
  },
});

const jaCopy = createLocalizedDemoCopy({
  aboutMetric: "{title} の詳細を見る",
  today: {
    title: "AIコーチからの今日の提案",
    date: "6月3日",
    isoDate: "2026-06-03",
    weekday: "水曜日",
    summary:
      "テンポ走は予定どおり行いましょう。ウォームアップ後に疲労が強まる場合は強度を抑え、明日の有酸素トレーニングに備えてください。",
    tags: ["ワークアウト 1件", "TSB -4", "最近のアクティビティあり"],
    askCoach: "AIコーチに相談",
  },
  currentPlan: {
    title: "現在のプラン",
    cycle: "マラソン基礎期",
    weekTarget: "週間目標",
    weekTargetLoad: "5",
    weekLabel: "5 / 12週",
    todayFocus: "有酸素量を重視し、質の高いセッションを1回",
    viewCurrentPlan: "現在のプランを見る",
  },
  currentState: {
    title: "現在の状態",
    settingsAria: "現在の状態を設定",
    settingsTitle: "現在の状態をカスタマイズ",
    healthTitle: "健康",
    restingHeartRate: "安静時心拍",
    maxHeartRate: "最大心拍",
  },
  fitnessCards: [
    {
      title: "疲労",
      description: "急性トレーニング負荷",
      details:
        "ATL は直近のトレーニングによる短期的な疲労を示し、負荷の高い日が続くと上昇します。",
    },
    {
      title: "体力",
      description: "慢性トレーニング負荷",
      details: "CTL は継続的なトレーニングで蓄積する長期的な体力の目安です。",
    },
    {
      title: "調子",
      description: "トレーニングストレスバランス",
      details:
        "TSB は体力と疲労の差を示します。負の値は疲労が多く残っている状態を表します。",
    },
    {
      title: "VO₂max",
      description: "心肺フィットネス",
      details:
        "VO₂max は有酸素能力の上限を推定する指標で、単日の値より長期的な推移が重要です。",
      level: "非常に良い",
    },
    {
      title: "トレーニング負担",
      description: "負荷指標",
      details:
        "トレーニング負担は、現在の能力に対して直近のセッションがどの程度きつかったかをまとめた指標です。",
    },
    {
      title: "推奨休養",
      description: "TSB=0 まで",
      details:
        "疲労と体力のバランスが TSB=0 付近に戻るまでに必要な軽めの日数の目安です。",
      unit: "日",
    },
  ],
  load: {
    weeklyTrainingLoad: "今週のトレーニング負荷",
    weeklySessionCount: "今週のトレーニング回数",
    loadUnit: "負荷",
    goal: "目標",
    completedLabel: "完了",
    chartTitle: "今週の負荷",
    actual: "実績",
    planned: "予定",
    todayValues: "今日：実績 18 · 予定 72",
    chartAria: "今週の実績負荷と予定負荷の比較",
    weekdays: ["月", "火", "水", "木", "金", "土", "日"],
  },
  summary: {
    title: "サマリー",
    description: "今日の判断に影響する主なトレーニング指標。",
    metrics: [
      { title: "PMC", label: "負荷", value: "CTL 72 · ATL 76", hint: "TSB -4" },
      { title: "パワー", label: "FTP", value: "FTP 286W", hint: "CP 302W" },
      {
        title: "スピード",
        label: "ペース",
        value: "TP 4:18/km",
        hint: "CS 4:05/km",
      },
      {
        title: "心拍",
        label: "BPM",
        value: "安静時 48 bpm",
        hint: "最大 188 bpm",
      },
    ],
  },
  todayExecution: {
    title: "今日の実行",
    meta: "6月3日 · 水曜日 · 予定 1件",
    isoDate: "2026-06-03",
    enterToday: "今日を開く",
    workoutTitle: "テンポ走",
    status: "予定",
    sport: "ランニング",
    duration: "52分",
    focus: "ややきつめの一定ペースで 8分 × 3本",
    linked: "関連アクティビティなし",
    actionPostpone: "延期",
    actionSkip: "スキップ",
    actionDelete: "削除",
    deleteDisabledTip:
      "進行中のプランでは、単一ワークアウトの削除にはまだ対応していません。",
    session: "本",
  },
  recentActivity: {
    titleSection: "最近のアクティビティ",
    items: [
      {
        title: "有酸素ラン",
        time: "06-02 07:42",
        summary: "11.8 km · 62分",
        status: "分析済み",
      },
      {
        title: "エンデュランスライド",
        time: "06-01 18:20",
        summary: "54.2 km · 126分",
        status: "同期済み",
      },
      {
        title: "スイム技術練習",
        time: "05-31 06:55",
        summary: "2.0 km · 45分",
        status: "分析済み",
      },
    ],
  },
  upload: {
    title: "アクティビティをアップロード",
    cardTitle: "アクティビティファイルを取り込む",
    description:
      "FIT、GPX、TCX ファイルを取り込み、トレーニング履歴を補完できます。",
    selectFile: "ファイルを選択",
  },
});

const deCopy = createLocalizedDemoCopy({
  aboutMetric: "Mehr über {title}",
  today: {
    title: "Heutiger Vorschlag des KI-Coachs",
    date: "3. Juni",
    isoDate: "2026-06-03",
    weekday: "Mittwoch",
    summary:
      "Den Tempolauf beibehalten. Nimmt die Ermüdung nach dem Aufwärmen zu, die Intensität begrenzen und Kraft für die morgige Grundlagen-Einheit sparen.",
    tags: ["1 Training", "TSB -4", "Aktuelle Aktivität"],
    askCoach: "KI-Coach fragen",
  },
  currentPlan: {
    title: "Aktueller Plan",
    cycle: "Marathon-Grundlagenblock",
    weekTarget: "Wochenziel",
    weekTargetLoad: "5",
    weekLabel: "Woche 5 / 12",
    todayFocus: "Grundlagenausdauer mit einer Qualitätseinheit",
    viewCurrentPlan: "Aktuellen Plan ansehen",
  },
  currentState: {
    title: "Aktueller Zustand",
    settingsAria: "Aktuellen Zustand einstellen",
    settingsTitle: "Aktuellen Zustand anpassen",
    healthTitle: "Gesundheit",
    restingHeartRate: "Ruhepuls",
    maxHeartRate: "Maximalpuls",
  },
  fitnessCards: [
    {
      title: "Ermüdung",
      description: "Akute Trainingsbelastung",
      details:
        "ATL zeigt die kurzfristige Ermüdung durch das jüngste Training und steigt meist nach mehreren harten Einheiten in kurzer Folge.",
    },
    {
      title: "Fitness",
      description: "Chronische Trainingsbelastung",
      details:
        "CTL beschreibt die längerfristig aufgebaute Fitness. Sie steigt bei regelmäßigem Training langsam an und sinkt bei Entlastung.",
    },
    {
      title: "Form",
      description: "Trainingsbelastungsbilanz",
      details:
        "TSB vergleicht Fitness und Ermüdung. Negative Werte deuten auf mehr Ermüdung als Frische hin.",
    },
    {
      title: "VO₂max",
      description: "Kardiorespiratorische Fitness",
      details:
        "VO₂max schätzt die aerobe Leistungsgrenze. Entscheidend ist die Entwicklung über Zeit, nicht ein einzelner Tageswert.",
      level: "Ausgezeichnet",
    },
    {
      title: "Trainingsbeanspruchung",
      description: "Belastungskennzahl",
      details:
        "Die Trainingsbeanspruchung fasst zusammen, wie fordernd die letzten Einheiten im Verhältnis zur aktuellen Leistungsfähigkeit waren.",
    },
    {
      title: "Empfohlene Erholung",
      description: "Bis TSB=0",
      details:
        "Schätzt, wie viele lockere Tage nötig sein könnten, bis sich Fitness und Ermüdung wieder um TSB=0 einpendeln.",
      unit: "Tage",
    },
  ],
  load: {
    weeklyTrainingLoad: "Wochenbelastung",
    weeklySessionCount: "Einheiten/Woche",
    loadUnit: "Belastung",
    goal: "Ziel",
    completedLabel: "Abgeschlossen",
    chartTitle: "Wochenbelastung",
    actual: "Tatsächlich",
    planned: "Geplant",
    todayValues: "Heute: tatsächlich 18 · geplant 72",
    chartAria:
      "Vergleich von tatsächlicher und geplanter Trainingsbelastung dieser Woche",
    weekdays: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
  },
  summary: {
    title: "Zusammenfassung",
    description:
      "Wichtige Trainingssignale für die nächste Entscheidung heute.",
    metrics: [
      {
        title: "PMC",
        label: "Belastung",
        value: "CTL 72 · ATL 76",
        hint: "TSB -4",
      },
      { title: "Leistung", label: "FTP", value: "FTP 286W", hint: "CP 302W" },
      {
        title: "Geschwindigkeit",
        label: "Tempo",
        value: "TP 4:18/km",
        hint: "CS 4:05/km",
      },
      {
        title: "Herzfrequenz",
        label: "BPM",
        value: "Ruhepuls 48 bpm",
        hint: "Max. 188 bpm",
      },
    ],
  },
  todayExecution: {
    title: "Heutiges Training",
    meta: "3. Juni · Mittwoch · 1 Einheit geplant",
    isoDate: "2026-06-03",
    enterToday: "Heute öffnen",
    workoutTitle: "Tempolauf",
    status: "Geplant",
    sport: "Laufen",
    duration: "52 Min.",
    focus: "3 × 8 Min. zügig und kontrolliert",
    linked: "Keine Aktivität verknüpft",
    actionPostpone: "Verschieben",
    actionSkip: "Überspringen",
    actionDelete: "Löschen",
    deleteDisabledTip:
      "Einzelne Einheiten aktiver Pläne können derzeit nicht gelöscht werden.",
    session: "Einheit",
  },
  recentActivity: {
    titleSection: "Letzte Aktivitäten",
    items: [
      {
        title: "Grundlagenlauf",
        time: "02.06. 07:42",
        summary: "11,8 km · 62 Min.",
        status: "Analysiert",
      },
      {
        title: "Ausdauerfahrt",
        time: "01.06. 18:20",
        summary: "54,2 km · 126 Min.",
        status: "Synchronisiert",
      },
      {
        title: "Schwimmtechnik",
        time: "31.05. 06:55",
        summary: "2,0 km · 45 Min.",
        status: "Analysiert",
      },
    ],
  },
  upload: {
    title: "Aktivität hochladen",
    cardTitle: "Aktivitätsdateien importieren",
    description: "FIT-, GPX- und TCX-Dateien ergänzen fehlende Trainingsdaten.",
    selectFile: "Datei auswählen",
  },
});

const esCopy = createLocalizedDemoCopy({
  aboutMetric: "Más información sobre {title}",
  today: {
    title: "Sugerencia de hoy del entrenador con IA",
    date: "3 de junio",
    isoDate: "2026-06-03",
    weekday: "miércoles",
    summary:
      "Mantén la carrera tempo. Si la fatiga aumenta después del calentamiento, limita la intensidad y reserva energía para el trabajo aeróbico de mañana.",
    tags: ["1 entrenamiento", "TSB -4", "Actividad reciente"],
    askCoach: "Preguntar al entrenador con IA",
  },
  currentPlan: {
    title: "Plan actual",
    cycle: "Bloque base de maratón",
    weekTarget: "Objetivo semanal",
    weekTargetLoad: "5",
    weekLabel: "Semana 5 / 12",
    todayFocus: "Volumen aeróbico con una sesión de calidad",
    viewCurrentPlan: "Ver el plan actual",
  },
  currentState: {
    title: "Estado actual",
    settingsAria: "Configurar el estado actual",
    settingsTitle: "Personalizar el estado actual",
    healthTitle: "Salud",
    restingHeartRate: "FC en reposo",
    maxHeartRate: "FC máxima",
  },
  fitnessCards: [
    {
      title: "Fatiga",
      description: "Carga aguda de entrenamiento",
      details:
        "La ATL refleja la fatiga a corto plazo de los entrenamientos recientes y suele subir tras varias sesiones exigentes seguidas.",
    },
    {
      title: "Forma física",
      description: "Carga crónica de entrenamiento",
      details:
        "La CTL representa la forma física acumulada a largo plazo: aumenta con la constancia y baja al reducir el entrenamiento.",
    },
    {
      title: "Estado de forma",
      description: "Balance de estrés de entrenamiento",
      details:
        "El TSB compara forma física y fatiga. Los valores negativos indican que llevas más fatiga acumulada.",
    },
    {
      title: "VO₂ máx.",
      description: "Capacidad cardiorrespiratoria",
      details:
        "El VO₂ máx. estima tu techo aeróbico; conviene observar su tendencia, no un único valor diario.",
      level: "Excelente",
    },
    {
      title: "Esfuerzo de entrenamiento",
      description: "Métrica de carga",
      details:
        "Resume lo exigentes que han sido las sesiones recientes en relación con tu capacidad actual.",
    },
    {
      title: "Descanso recomendado",
      description: "Hasta TSB=0",
      details:
        "Estima cuántos días suaves podrías necesitar para volver a equilibrar fatiga y forma física cerca de TSB=0.",
      unit: "días",
    },
  ],
  load: {
    weeklyTrainingLoad: "Carga semanal",
    weeklySessionCount: "Sesiones/semana",
    loadUnit: "Carga",
    goal: "Objetivo",
    completedLabel: "Completadas",
    chartTitle: "Carga semanal",
    actual: "Real",
    planned: "Planificada",
    todayValues: "Hoy: real 18 · planificada 72",
    chartAria: "Comparación de la carga real y planificada de esta semana",
    weekdays: ["L", "M", "X", "J", "V", "S", "D"],
  },
  summary: {
    title: "Resumen",
    description: "Señales clave para decidir el siguiente paso de hoy.",
    metrics: [
      {
        title: "PMC",
        label: "Carga",
        value: "CTL 72 · ATL 76",
        hint: "TSB -4",
      },
      { title: "Potencia", label: "FTP", value: "FTP 286W", hint: "CP 302W" },
      {
        title: "Velocidad",
        label: "Ritmo",
        value: "TP 4:18/km",
        hint: "CS 4:05/km",
      },
      {
        title: "Frecuencia cardiaca",
        label: "LPM",
        value: "Reposo 48 lpm",
        hint: "Máx. 188 lpm",
      },
    ],
  },
  todayExecution: {
    title: "Entrenamiento de hoy",
    meta: "3 de junio · miércoles · 1 entrenamiento planificado",
    isoDate: "2026-06-03",
    enterToday: "Abrir hoy",
    workoutTitle: "Carrera tempo",
    status: "Planificado",
    sport: "Carrera",
    duration: "52 min",
    focus: "3 × 8 min a ritmo sostenido",
    linked: "Sin actividad vinculada",
    actionPostpone: "Posponer",
    actionSkip: "Omitir",
    actionDelete: "Eliminar",
    deleteDisabledTip:
      "Todavía no se pueden eliminar entrenamientos individuales de planes activos.",
    session: "sesión",
  },
  recentActivity: {
    titleSection: "Actividades recientes",
    items: [
      {
        title: "Carrera aeróbica",
        time: "02/06 07:42",
        summary: "11,8 km · 62 min",
        status: "Analizada",
      },
      {
        title: "Ciclismo de resistencia",
        time: "01/06 18:20",
        summary: "54,2 km · 126 min",
        status: "Sincronizada",
      },
      {
        title: "Técnica de natación",
        time: "31/05 06:55",
        summary: "2,0 km · 45 min",
        status: "Analizada",
      },
    ],
  },
  upload: {
    title: "Subir actividad",
    cardTitle: "Importar archivos de actividad",
    description: "Importa archivos FIT, GPX o TCX para completar tu historial.",
    selectFile: "Elegir archivo",
  },
});

const frCopy = createLocalizedDemoCopy({
  aboutMetric: "En savoir plus sur {title}",
  today: {
    title: "Conseil du jour du coach IA",
    date: "3 juin",
    isoDate: "2026-06-03",
    weekday: "mercredi",
    summary:
      "Conservez la séance au seuil. Si la fatigue augmente après l’échauffement, réduisez l’intensité afin de préserver la séance aérobie de demain.",
    tags: ["1 entraînement", "TSB -4", "Activité récente"],
    askCoach: "Demander au coach IA",
  },
  currentPlan: {
    title: "Plan actuel",
    cycle: "Bloc de base marathon",
    weekTarget: "Objectif hebdomadaire",
    weekTargetLoad: "5",
    weekLabel: "Semaine 5 / 12",
    todayFocus: "Volume aérobie avec une séance de qualité",
    viewCurrentPlan: "Voir le plan actuel",
  },
  currentState: {
    title: "État actuel",
    settingsAria: "Régler l’état actuel",
    settingsTitle: "Personnaliser l’état actuel",
    healthTitle: "Santé",
    restingHeartRate: "Fréquence cardiaque au repos",
    maxHeartRate: "Fréquence cardiaque maximale",
  },
  fitnessCards: [
    {
      title: "Fatigue",
      description: "Charge d’entraînement aiguë",
      details:
        "L’ATL reflète la fatigue à court terme liée aux entraînements récents et augmente souvent après plusieurs séances difficiles rapprochées.",
    },
    {
      title: "Condition physique",
      description: "Charge d’entraînement chronique",
      details:
        "La CTL représente la condition physique construite sur la durée. Elle progresse avec la régularité et baisse lors d’une période allégée.",
    },
    {
      title: "Forme",
      description: "Équilibre du stress d’entraînement",
      details:
        "Le TSB compare condition physique et fatigue. Une valeur négative indique une fatigue accumulée plus importante.",
    },
    {
      title: "VO₂ max",
      description: "Capacité cardiorespiratoire",
      details:
        "La VO₂ max estime votre plafond aérobie. Sa tendance compte davantage qu’une valeur isolée.",
      level: "Excellent",
    },
    {
      title: "Contrainte d’entraînement",
      description: "Indicateur de charge",
      details:
        "Elle résume l’exigence des séances récentes par rapport à votre capacité actuelle.",
    },
    {
      title: "Repos conseillé",
      description: "Jusqu’à TSB=0",
      details:
        "Estime le nombre de jours faciles nécessaires pour rééquilibrer fatigue et condition physique autour de TSB=0.",
      unit: "jours",
    },
  ],
  load: {
    weeklyTrainingLoad: "Charge hebdomadaire",
    weeklySessionCount: "Séances/semaine",
    loadUnit: "Charge",
    goal: "Objectif",
    completedLabel: "Effectuées",
    chartTitle: "Charge hebdomadaire",
    actual: "Réalisée",
    planned: "Planifiée",
    todayValues: "Aujourd’hui : réalisée 18 · planifiée 72",
    chartAria: "Comparaison de la charge réalisée et planifiée cette semaine",
    weekdays: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"],
  },
  summary: {
    title: "Résumé",
    description:
      "Les principaux indicateurs qui orientent la prochaine décision du jour.",
    metrics: [
      {
        title: "PMC",
        label: "Charge",
        value: "CTL 72 · ATL 76",
        hint: "TSB -4",
      },
      { title: "Puissance", label: "FTP", value: "FTP 286W", hint: "CP 302W" },
      {
        title: "Vitesse",
        label: "Allure",
        value: "TP 4:18/km",
        hint: "CS 4:05/km",
      },
      {
        title: "Fréquence cardiaque",
        label: "BPM",
        value: "Repos 48 bpm",
        hint: "Max. 188 bpm",
      },
    ],
  },
  todayExecution: {
    title: "Entraînement du jour",
    meta: "3 juin · mercredi · 1 séance prévue",
    isoDate: "2026-06-03",
    enterToday: "Ouvrir aujourd’hui",
    workoutTitle: "Course au seuil",
    status: "Prévue",
    sport: "Course",
    duration: "52 min",
    focus: "3 × 8 min à allure soutenue et maîtrisée",
    linked: "Aucune activité associée",
    actionPostpone: "Reporter",
    actionSkip: "Ignorer",
    actionDelete: "Supprimer",
    deleteDisabledTip:
      "La suppression d’une séance isolée n’est pas encore disponible pour les plans actifs.",
    session: "séance",
  },
  recentActivity: {
    titleSection: "Activités récentes",
    items: [
      {
        title: "Course aérobie",
        time: "02/06 07:42",
        summary: "11,8 km · 62 min",
        status: "Analysée",
      },
      {
        title: "Sortie d’endurance",
        time: "01/06 18:20",
        summary: "54,2 km · 126 min",
        status: "Synchronisée",
      },
      {
        title: "Technique de nage",
        time: "31/05 06:55",
        summary: "2,0 km · 45 min",
        status: "Analysée",
      },
    ],
  },
  upload: {
    title: "Importer une activité",
    cardTitle: "Importer des fichiers d’activité",
    description:
      "Importez des fichiers FIT, GPX ou TCX pour compléter votre historique.",
    selectFile: "Choisir un fichier",
  },
});

const itCopy = createLocalizedDemoCopy({
  aboutMetric: "Scopri di più su {title}",
  today: {
    title: "Suggerimento di oggi del coach AI",
    date: "3 giugno",
    isoDate: "2026-06-03",
    weekday: "mercoledì",
    summary:
      "Mantieni la corsa a ritmo medio. Se la fatica aumenta dopo il riscaldamento, limita l’intensità e conserva energie per il lavoro aerobico di domani.",
    tags: ["1 allenamento", "TSB -4", "Attività recente"],
    askCoach: "Chiedi al coach AI",
  },
  currentPlan: {
    title: "Piano attuale",
    cycle: "Blocco base maratona",
    weekTarget: "Obiettivo settimanale",
    weekTargetLoad: "5",
    weekLabel: "Settimana 5 / 12",
    todayFocus: "Volume aerobico con una seduta di qualità",
    viewCurrentPlan: "Visualizza il piano attuale",
  },
  currentState: {
    title: "Stato attuale",
    settingsAria: "Impostazioni dello stato attuale",
    settingsTitle: "Personalizza lo stato attuale",
    healthTitle: "Salute",
    restingHeartRate: "Frequenza cardiaca a riposo",
    maxHeartRate: "Frequenza cardiaca massima",
  },
  fitnessCards: [
    {
      title: "Fatica",
      description: "Carico acuto di allenamento",
      details:
        "L’ATL riflette la fatica a breve termine degli allenamenti recenti e tende a salire dopo più sedute impegnative ravvicinate.",
    },
    {
      title: "Forma fisica",
      description: "Carico cronico di allenamento",
      details:
        "Il CTL rappresenta la forma costruita nel tempo: cresce con la continuità e cala quando il carico viene ridotto.",
    },
    {
      title: "Freschezza",
      description: "Bilancio dello stress di allenamento",
      details:
        "Il TSB confronta forma e fatica. Un valore negativo indica una maggiore fatica accumulata.",
    },
    {
      title: "VO₂max",
      description: "Capacità cardiorespiratoria",
      details:
        "Il VO₂max stima il limite aerobico. È più utile seguirne l’andamento che un singolo valore giornaliero.",
      level: "Eccellente",
    },
    {
      title: "Stress di allenamento",
      description: "Indicatore di carico",
      details:
        "Riassume quanto sono state impegnative le sedute recenti rispetto alla capacità attuale.",
    },
    {
      title: "Recupero consigliato",
      description: "Fino a TSB=0",
      details:
        "Stima quanti giorni leggeri possono servire per riequilibrare fatica e forma intorno a TSB=0.",
      unit: "giorni",
    },
  ],
  load: {
    weeklyTrainingLoad: "Carico settimanale",
    weeklySessionCount: "Sessioni/settimana",
    loadUnit: "Carico",
    goal: "Obiettivo",
    completedLabel: "Completate",
    chartTitle: "Carico settimanale",
    actual: "Effettivo",
    planned: "Pianificato",
    todayValues: "Oggi: effettivo 18 · pianificato 72",
    chartAria: "Confronto tra carico effettivo e pianificato della settimana",
    weekdays: ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"],
  },
  summary: {
    title: "Riepilogo",
    description:
      "I segnali principali che orientano la prossima scelta di oggi.",
    metrics: [
      {
        title: "PMC",
        label: "Carico",
        value: "CTL 72 · ATL 76",
        hint: "TSB -4",
      },
      { title: "Potenza", label: "FTP", value: "FTP 286W", hint: "CP 302W" },
      {
        title: "Velocità",
        label: "Passo",
        value: "TP 4:18/km",
        hint: "CS 4:05/km",
      },
      {
        title: "Frequenza cardiaca",
        label: "BPM",
        value: "Riposo 48 bpm",
        hint: "Max 188 bpm",
      },
    ],
  },
  todayExecution: {
    title: "Allenamento di oggi",
    meta: "3 giugno · mercoledì · 1 allenamento pianificato",
    isoDate: "2026-06-03",
    enterToday: "Apri oggi",
    workoutTitle: "Corsa a ritmo medio",
    status: "Pianificato",
    sport: "Corsa",
    duration: "52 min",
    focus: "3 × 8 min a ritmo sostenuto e controllato",
    linked: "Nessuna attività collegata",
    actionPostpone: "Rimanda",
    actionSkip: "Salta",
    actionDelete: "Elimina",
    deleteDisabledTip:
      "Non è ancora possibile eliminare un singolo allenamento da un piano attivo.",
    session: "sessione",
  },
  recentActivity: {
    titleSection: "Attività recenti",
    items: [
      {
        title: "Corsa aerobica",
        time: "02/06 07:42",
        summary: "11,8 km · 62 min",
        status: "Analizzata",
      },
      {
        title: "Uscita endurance",
        time: "01/06 18:20",
        summary: "54,2 km · 126 min",
        status: "Sincronizzata",
      },
      {
        title: "Tecnica di nuoto",
        time: "31/05 06:55",
        summary: "2,0 km · 45 min",
        status: "Analizzata",
      },
    ],
  },
  upload: {
    title: "Carica attività",
    cardTitle: "Importa file di attività",
    description:
      "Importa file FIT, GPX o TCX per completare lo storico degli allenamenti.",
    selectFile: "Scegli file",
  },
});

const koCopy = createLocalizedDemoCopy({
  aboutMetric: "{title} 자세히 보기",
  today: {
    title: "AI 코치의 오늘 제안",
    date: "6월 3일",
    isoDate: "2026-06-03",
    weekday: "수요일",
    summary:
      "템포런은 예정대로 진행하세요. 워밍업 후 피로가 더 커지면 강도를 낮추고 내일의 유산소 훈련을 위해 여유를 남기세요.",
    tags: ["훈련 1개", "TSB -4", "최근 활동 있음"],
    askCoach: "AI 코치에게 묻기",
  },
  currentPlan: {
    title: "현재 계획",
    cycle: "마라톤 기초 블록",
    weekTarget: "주간 목표",
    weekTargetLoad: "5",
    weekLabel: "5 / 12주차",
    todayFocus: "유산소 볼륨 중심, 품질 훈련 1회",
    viewCurrentPlan: "현재 계획 보기",
  },
  currentState: {
    title: "현재 상태",
    settingsAria: "현재 상태 설정",
    settingsTitle: "현재 상태 맞춤 설정",
    healthTitle: "건강",
    restingHeartRate: "안정시 심박수",
    maxHeartRate: "최대 심박수",
  },
  fitnessCards: [
    {
      title: "피로",
      description: "급성 훈련 부하",
      details:
        "ATL은 최근 훈련에서 쌓인 단기 피로를 나타내며, 강도 높은 훈련이 이어지면 보통 상승합니다.",
    },
    {
      title: "체력",
      description: "만성 훈련 부하",
      details:
        "CTL은 꾸준한 훈련으로 쌓이는 장기 체력 지표입니다. 지속적으로 훈련하면 천천히 오르고 훈련량을 줄이면 내려갑니다.",
    },
    {
      title: "컨디션",
      description: "훈련 스트레스 균형",
      details:
        "TSB는 체력과 피로의 차이를 나타냅니다. 음수는 피로가 더 많이 남아 있음을 뜻합니다.",
    },
    {
      title: "VO₂max",
      description: "심폐 체력",
      details:
        "VO₂max는 유산소 능력의 상한을 추정합니다. 하루 수치보다 장기 추세를 보는 것이 중요합니다.",
      level: "매우 좋음",
    },
    {
      title: "훈련 부담",
      description: "부하 지표",
      details: "최근 훈련이 현재 능력에 비해 얼마나 부담스러웠는지 요약합니다.",
    },
    {
      title: "권장 휴식",
      description: "TSB=0까지",
      details:
        "피로와 체력이 TSB=0 부근에서 다시 균형을 이루는 데 필요한 가벼운 훈련 일수를 추정합니다.",
      unit: "일",
    },
  ],
  load: {
    weeklyTrainingLoad: "이번 주 훈련 부하",
    weeklySessionCount: "이번 주 훈련 횟수",
    loadUnit: "부하",
    goal: "목표",
    completedLabel: "완료",
    chartTitle: "이번 주 부하",
    actual: "실제",
    planned: "계획",
    todayValues: "오늘: 실제 18 · 계획 72",
    chartAria: "이번 주 실제 훈련 부하와 계획 부하 비교",
    weekdays: ["월", "화", "수", "목", "금", "토", "일"],
  },
  summary: {
    title: "요약",
    description: "오늘의 다음 판단에 영향을 주는 핵심 훈련 지표입니다.",
    metrics: [
      { title: "PMC", label: "부하", value: "CTL 72 · ATL 76", hint: "TSB -4" },
      { title: "파워", label: "FTP", value: "FTP 286W", hint: "CP 302W" },
      {
        title: "속도",
        label: "페이스",
        value: "TP 4:18/km",
        hint: "CS 4:05/km",
      },
      {
        title: "심박수",
        label: "BPM",
        value: "안정시 48 bpm",
        hint: "최대 188 bpm",
      },
    ],
  },
  todayExecution: {
    title: "오늘의 훈련",
    meta: "6월 3일 · 수요일 · 계획 1개",
    isoDate: "2026-06-03",
    enterToday: "오늘 열기",
    workoutTitle: "템포런",
    status: "계획",
    sport: "달리기",
    duration: "52분",
    focus: "빠르지만 안정적인 페이스로 8분 × 3회",
    linked: "연결된 활동 없음",
    actionPostpone: "미루기",
    actionSkip: "건너뛰기",
    actionDelete: "삭제",
    deleteDisabledTip:
      "진행 중인 계획에서는 아직 개별 훈련을 삭제할 수 없습니다.",
    session: "세트",
  },
  recentActivity: {
    titleSection: "최근 활동",
    items: [
      {
        title: "유산소 달리기",
        time: "06-02 07:42",
        summary: "11.8 km · 62분",
        status: "분석 완료",
      },
      {
        title: "지구력 라이딩",
        time: "06-01 18:20",
        summary: "54.2 km · 126분",
        status: "동기화됨",
      },
      {
        title: "수영 기술 훈련",
        time: "05-31 06:55",
        summary: "2.0 km · 45분",
        status: "분석 완료",
      },
    ],
  },
  upload: {
    title: "활동 업로드",
    cardTitle: "활동 파일 가져오기",
    description: "FIT, GPX, TCX 파일을 가져와 훈련 기록을 보완할 수 있습니다.",
    selectFile: "파일 선택",
  },
});

const ptBrCopy = createLocalizedDemoCopy({
  aboutMetric: "Saiba mais sobre {title}",
  today: {
    title: "Sugestão de hoje do treinador de IA",
    date: "3 de junho",
    isoDate: "2026-06-03",
    weekday: "quarta-feira",
    summary:
      "Mantenha a corrida em ritmo tempo. Se a fadiga aumentar após o aquecimento, reduza a intensidade e preserve energia para o treino aeróbico de amanhã.",
    tags: ["1 treino", "TSB -4", "Atividade recente"],
    askCoach: "Perguntar ao treinador de IA",
  },
  currentPlan: {
    title: "Plano atual",
    cycle: "Bloco de base para maratona",
    weekTarget: "Meta semanal",
    weekTargetLoad: "5",
    weekLabel: "Semana 5 / 12",
    todayFocus: "Volume aeróbico com uma sessão de qualidade",
    viewCurrentPlan: "Ver plano atual",
  },
  currentState: {
    title: "Estado atual",
    settingsAria: "Configurar estado atual",
    settingsTitle: "Personalizar estado atual",
    healthTitle: "Saúde",
    restingHeartRate: "Frequência cardíaca de repouso",
    maxHeartRate: "Frequência cardíaca máxima",
  },
  fitnessCards: [
    {
      title: "Fadiga",
      description: "Carga aguda de treinamento",
      details:
        "A ATL representa a fadiga de curto prazo dos treinos recentes e costuma subir após várias sessões exigentes em sequência.",
    },
    {
      title: "Condicionamento",
      description: "Carga crônica de treinamento",
      details:
        "A CTL representa o condicionamento construído ao longo do tempo: sobe com consistência e cai quando o volume é reduzido.",
    },
    {
      title: "Forma",
      description: "Balanço do estresse de treinamento",
      details:
        "O TSB compara condicionamento e fadiga. Valores negativos indicam maior fadiga acumulada.",
    },
    {
      title: "VO₂ máx.",
      description: "Capacidade cardiorrespiratória",
      details:
        "O VO₂ máx. estima seu teto aeróbico. A tendência ao longo do tempo é mais útil do que um valor isolado.",
      level: "Excelente",
    },
    {
      title: "Esforço de treinamento",
      description: "Métrica de carga",
      details:
        "Resume o quanto as sessões recentes exigiram em relação à sua capacidade atual.",
    },
    {
      title: "Descanso recomendado",
      description: "Até TSB=0",
      details:
        "Estima quantos dias leves podem ser necessários para reequilibrar fadiga e condicionamento perto de TSB=0.",
      unit: "dias",
    },
  ],
  load: {
    weeklyTrainingLoad: "Carga semanal",
    weeklySessionCount: "Sessões/semana",
    loadUnit: "Carga",
    goal: "Meta",
    completedLabel: "Concluídas",
    chartTitle: "Carga semanal",
    actual: "Realizada",
    planned: "Planejada",
    todayValues: "Hoje: realizada 18 · planejada 72",
    chartAria: "Comparação da carga realizada e planejada desta semana",
    weekdays: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
  },
  summary: {
    title: "Resumo",
    description: "Os principais sinais que orientam a próxima decisão de hoje.",
    metrics: [
      {
        title: "PMC",
        label: "Carga",
        value: "CTL 72 · ATL 76",
        hint: "TSB -4",
      },
      { title: "Potência", label: "FTP", value: "FTP 286W", hint: "CP 302W" },
      {
        title: "Velocidade",
        label: "Ritmo",
        value: "TP 4:18/km",
        hint: "CS 4:05/km",
      },
      {
        title: "Frequência cardíaca",
        label: "BPM",
        value: "Repouso 48 bpm",
        hint: "Máx. 188 bpm",
      },
    ],
  },
  todayExecution: {
    title: "Treino de hoje",
    meta: "3 de junho · quarta-feira · 1 treino planejado",
    isoDate: "2026-06-03",
    enterToday: "Abrir hoje",
    workoutTitle: "Corrida em ritmo tempo",
    status: "Planejado",
    sport: "Corrida",
    duration: "52 min",
    focus: "3 × 8 min em ritmo forte e controlado",
    linked: "Nenhuma atividade vinculada",
    actionPostpone: "Adiar",
    actionSkip: "Pular",
    actionDelete: "Excluir",
    deleteDisabledTip:
      "Ainda não é possível excluir um treino individual de um plano ativo.",
    session: "sessão",
  },
  recentActivity: {
    titleSection: "Atividades recentes",
    items: [
      {
        title: "Corrida aeróbica",
        time: "02/06 07:42",
        summary: "11,8 km · 62 min",
        status: "Analisada",
      },
      {
        title: "Pedal de resistência",
        time: "01/06 18:20",
        summary: "54,2 km · 126 min",
        status: "Sincronizada",
      },
      {
        title: "Técnica de natação",
        time: "31/05 06:55",
        summary: "2,0 km · 45 min",
        status: "Analisada",
      },
    ],
  },
  upload: {
    title: "Enviar atividade",
    cardTitle: "Importar arquivos de atividade",
    description:
      "Importe arquivos FIT, GPX ou TCX para completar seu histórico de treinos.",
    selectFile: "Escolher arquivo",
  },
});

const demoCopy = {
  de: deCopy,
  en: enCopy,
  es: esCopy,
  fr: frCopy,
  it: itCopy,
  ja: jaCopy,
  ko: koCopy,
  "pt-BR": ptBrCopy,
  zh: zhCopy,
  "zh-hant": zhHantCopy,
} satisfies Record<string, DemoCopy>;

function SectionTitle({ title, action }: { title: string; action?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {action ? (
        <button
          type="button"
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {action}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function SoftPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={className}>{children}</section>;
}

function WeeklyLoadChartPanel({
  copy,
  interactive,
}: {
  copy: DemoCopy;
  interactive: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-surface bg-neutral-100 pb-2 pt-4 dark:bg-muted/45">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 px-4 text-[11px] text-muted-foreground">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="block h-[3px] w-3 shrink-0 rounded-full bg-[#7c3aed] dark:bg-[#a78bfa]" />
            {copy.load.actual}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg
              aria-hidden="true"
              width="12"
              height="12"
              viewBox="0 0 12 12"
              className="shrink-0 text-[#7c3aed] dark:text-[#a78bfa]"
            >
              <rect
                x="0.5"
                y="0.5"
                width="11"
                height="11"
                fill="currentColor"
                fillOpacity="0.1"
                stroke="currentColor"
                strokeOpacity="0.24"
              />
              <path
                d="M1 5L5 1 M1 11L11 1 M7 11L11 7"
                stroke="currentColor"
                strokeOpacity="0.42"
                strokeWidth="1.5"
              />
            </svg>
            {copy.load.planned}
          </span>
        </div>
        <span className="shrink-0 tabular-nums">{copy.load.todayValues}</span>
      </div>
      <div className="pb-1">
        <HomeProductDemoWeeklyLoadChart
          weekdays={copy.load.weekdays}
          actualLabel={copy.load.actual}
          plannedLabel={copy.load.planned}
          ariaLabel={copy.load.chartAria}
          interactive={interactive}
        />
      </div>
    </section>
  );
}

function LoadComparisonChart({
  copy,
  interactive,
}: {
  copy: DemoCopy;
  interactive: boolean;
}) {
  const loadProgress = 39;
  const sessionBars = [1, 1, 0, 0, 0, 0, 0] as const;

  return (
    <SoftPanel className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">
        {copy.load.chartTitle}
      </h2>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex min-w-0 flex-col rounded-compact bg-neutral-100 px-3 py-2.5 dark:bg-muted/45">
          <div className="truncate text-xs font-medium text-muted-foreground">
            {copy.load.weeklyTrainingLoad}
          </div>
          <div className="mt-2 flex items-end justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-2xl font-semibold leading-none tabular-nums">
                116
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {copy.load.loadUnit}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[10px] text-muted-foreground">
                {copy.load.goal} 300
              </div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {loadProgress}%
              </div>
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div
              aria-label={copy.load.weeklyTrainingLoad}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={loadProgress}
              className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
              role="progressbar"
              style={{ width: `${loadProgress}%` }}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col rounded-compact bg-neutral-100 px-3 py-2.5 dark:bg-muted/45">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
              {copy.load.weeklySessionCount}
            </div>
            <div className="shrink-0 text-right">
              <div className="flex items-baseline justify-end gap-1">
                <span className="text-2xl font-semibold leading-none tabular-nums">
                  2
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  / 5
                </span>
              </div>
              <div className="mt-1 text-[9px] text-muted-foreground">
                {copy.load.completedLabel} / {copy.load.goal}
              </div>
            </div>
          </div>
          <div className="mt-auto flex items-end justify-between gap-1 pt-1">
            {sessionBars.map((completed, index) => {
              const planned = index < 5;
              const height = planned ? 26 : 6;
              return (
                <div
                  key={copy.load.weekdays[index]}
                  className="min-w-0 flex-1 text-center"
                >
                  <div
                    aria-hidden="true"
                    className="mx-auto flex w-full max-w-3 items-end overflow-hidden rounded-t-sm bg-neutral-200 dark:bg-neutral-700/80"
                    style={{ height }}
                  >
                    {completed ? (
                      <div className="h-full w-full bg-emerald-500 dark:bg-emerald-400" />
                    ) : null}
                  </div>
                  <div className="mt-1 truncate text-[8px] text-muted-foreground">
                    {copy.load.weekdays[index]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <WeeklyLoadChartPanel copy={copy} interactive={interactive} />
    </SoftPanel>
  );
}

function SummaryPanel({
  copy,
  interactive,
  onOpenMetric,
}: {
  copy: DemoCopy;
  interactive: boolean;
  onOpenMetric: (key: SummaryMetricKey) => void;
}) {
  const itemClassName =
    "group rounded-compact bg-neutral-100 px-3 py-3 text-left transition-colors dark:bg-muted/45";

  return (
    <SoftPanel className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {copy.summary.title}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {copy.summary.description}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {copy.summary.metrics.map((item) => {
          const Icon = item.icon;
          const content = (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-compact bg-background text-muted-foreground transition-colors group-hover:text-foreground dark:bg-black/20">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-sm font-semibold">
                    {item.title}
                  </div>
                  <span className="shrink-0 rounded-compact bg-background px-2 py-0.5 text-[10px] text-muted-foreground dark:bg-black/20">
                    {item.label}
                  </span>
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {item.value} · {item.hint}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </div>
          );

          if (!interactive) {
            return (
              <div key={item.key} className={itemClassName}>
                {content}
              </div>
            );
          }

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onOpenMetric(item.key as SummaryMetricKey)}
              className={cn(
                itemClassName,
                "hover:bg-neutral-200 dark:hover:bg-muted",
              )}
            >
              {content}
            </button>
          );
        })}
      </div>
    </SoftPanel>
  );
}

function FitnessStatusCardSubContentStatic({
  stat,
}: {
  stat: FitnessStatCard;
}) {
  const barContainerClassName =
    "relative h-4 rounded-[2px] w-full overflow-hidden bg-muted dark:bg-white/[0.08] ring-1 ring-inset ring-border/40 dark:ring-white/12";

  if (stat.key === "atl" || stat.key === "ctl") {
    const percent = stat.percent ?? 0;
    const trackClass =
      stat.key === "atl"
        ? "bg-violet-500/20 dark:bg-violet-500/30"
        : "bg-sky-500/20 dark:bg-sky-500/30";
    const fillClass =
      stat.key === "atl"
        ? "bg-violet-500/90 dark:bg-violet-400"
        : "bg-sky-500/90 dark:bg-sky-400";

    return (
      <div className="flex items-center gap-2 flex-1">
        <div className={barContainerClassName}>
          <div className={cn("absolute left-0 top-0 h-4 w-full", trackClass)} />
          <div
            className={cn("absolute left-0 top-0 h-4 rounded-[2px]", fillClass)}
            style={{ width: `${percent}%` }}
          />
          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-background dark:text-foreground">
            {percent}%
          </span>
        </div>
      </div>
    );
  }

  if (stat.key === "vo2Max") {
    const percent = stat.percent ?? 0;
    const segments = [
      ["left-0", "w-[50%]", "bg-red-400/18 dark:bg-red-400/25"],
      ["left-[50%]", "w-[8.333%]", "bg-amber-400/18 dark:bg-amber-400/25"],
      [
        "left-[58.333%]",
        "w-[8.333%]",
        "bg-emerald-500/18 dark:bg-emerald-500/25",
      ],
      ["left-[66.666%]", "w-[16.667%]", "bg-sky-500/18 dark:bg-sky-500/25"],
      [
        "left-[83.333%]",
        "w-[16.667%]",
        "bg-violet-500/18 dark:bg-violet-500/25",
      ],
    ];
    const markers = [
      "left-[50%]",
      "left-[58.333%]",
      "left-[66.666%]",
      "left-[83.333%]",
    ];

    return (
      <div className="flex items-center gap-2 flex-1">
        <div className={barContainerClassName}>
          {segments.map(([left, width, color]) => (
            <div
              key={`${left}-${width}`}
              className={cn("absolute top-0 h-4", left, width, color)}
            />
          ))}
          {markers.map((left) => (
            <div
              key={left}
              className={cn(
                "absolute top-0 h-4 w-px bg-border dark:bg-white/15",
                left,
              )}
            />
          ))}
          <div
            className="absolute left-0 top-0 h-4 rounded-[2px] bg-violet-500/90 dark:bg-violet-400"
            style={{ width: `${percent}%` }}
          />
          <div
            className="absolute top-0 h-4 w-px bg-foreground/60 dark:bg-white/40"
            style={{ left: `${percent}%` }}
          />
        </div>
        <div className="text-xs font-medium shrink-0 w-10 text-right text-violet-500">
          {stat.level}
        </div>
      </div>
    );
  }

  if (stat.key === "tsb") {
    const percent = stat.percent ?? 0;
    const segments = [
      ["left-0", "w-[24%]", "bg-red-400/18 dark:bg-red-400/25"],
      ["left-[24%]", "w-[24%]", "bg-emerald-500/18 dark:bg-emerald-500/25"],
      ["left-[48%]", "w-[18%]", "bg-slate-400/18 dark:bg-slate-400/25"],
      ["left-[66%]", "w-[12%]", "bg-sky-500/18 dark:bg-sky-500/25"],
      ["left-[78%]", "w-[12%]", "bg-violet-500/18 dark:bg-violet-500/25"],
      ["left-[90%]", "w-[10%]", "bg-amber-500/18 dark:bg-amber-500/25"],
    ];

    return (
      <div className="flex items-center gap-2 flex-1">
        <div className={barContainerClassName}>
          {segments.map(([left, width, color]) => (
            <div
              key={`${left}-${width}`}
              className={cn("absolute top-0 h-4", left, width, color)}
            />
          ))}
          {[
            "left-[24%]",
            "left-[48%]",
            "left-[66%]",
            "left-[78%]",
            "left-[90%]",
          ].map((left) => (
            <div
              key={left}
              className={cn(
                "absolute top-0 h-4 w-px bg-border dark:bg-white/15",
                left,
              )}
            />
          ))}
          <div
            className="absolute left-0 top-0 h-4 rounded-[2px] bg-slate-300/90 dark:bg-slate-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  }

  return <p className="text-xs text-muted-foreground">{stat.description}</p>;
}

function FitnessStatusStatCardStatic({
  stat,
  interactive,
  onClick,
}: {
  stat: FitnessStatCard;
  interactive?: boolean;
  onClick?: () => void;
}) {
  const Icon = stat.icon;
  const cardClassName = cn(
    "relative w-full overflow-hidden rounded-compact border-0 bg-neutral-100 p-1 text-left shadow-none transition-colors dark:bg-muted/45",
    interactive && "cursor-pointer hover:bg-neutral-200 dark:hover:bg-muted",
  );

  const content = (
    <>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-2">
        <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
        <div className={cn("rounded-full", stat.bgColor)}>
          <Icon className={cn("h-4 w-4", stat.color)} />
        </div>
      </CardHeader>
      <CardContent className="lg:p-2">
        <div className="mt-2 sm:mt-6">
          <div className="text-2xl font-bold">
            {stat.value}
            {stat.unit && (
              <span className="text-xs font-normal text-muted-foreground ml-1">
                {stat.unit}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <FitnessStatusCardSubContentStatic stat={stat} />
            <div className="w-6 shrink-0 flex justify-end">
              <span className="rounded-full p-1 text-muted-foreground">
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </>
  );

  if (interactive && onClick) {
    return (
      <button type="button" onClick={onClick} className={cardClassName}>
        {content}
      </button>
    );
  }

  return <Card className={cardClassName}>{content}</Card>;
}

function FitnessStateMiniCardsStatic({
  copy,
  interactive,
  onFitnessCardClick,
}: {
  copy: DemoCopy;
  interactive?: boolean;
  onFitnessCardClick?: (stat: FitnessStatCard) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {copy.currentState.title}
        </h2>
        <button
          type="button"
          disabled={interactive}
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-compact text-muted-foreground",
            !interactive && "hover:text-foreground",
            interactive && "cursor-not-allowed opacity-50",
          )}
          aria-label={copy.currentState.settingsAria}
          title={copy.currentState.settingsTitle}
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {copy.fitnessCards.map((stat) => (
          <FitnessStatusStatCardStatic
            key={stat.key}
            stat={stat}
            interactive={interactive}
            onClick={
              interactive && onFitnessCardClick
                ? () => onFitnessCardClick(stat)
                : undefined
            }
          />
        ))}
      </div>

      <section className="rounded-compact border border-border/70 bg-background p-3">
        <div className="text-sm font-medium">
          {copy.currentState.healthTitle}
        </div>
        <div className="mt-2 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {copy.currentState.restingHeartRate}
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              48 <span className="text-xs text-muted-foreground">bpm</span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {copy.currentState.maxHeartRate}
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              188 <span className="text-xs text-muted-foreground">bpm</span>
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

function CurrentStatePanel({
  copy,
  interactive,
  onFitnessCardClick,
}: {
  copy: DemoCopy;
  interactive?: boolean;
  onFitnessCardClick?: (stat: FitnessStatCard) => void;
}) {
  return (
    <SoftPanel>
      <FitnessStateMiniCardsStatic
        copy={copy}
        interactive={interactive}
        onFitnessCardClick={onFitnessCardClick}
      />
    </SoftPanel>
  );
}

function TodayExecutionWorkoutCard({
  copy,
  interactive,
  onOpenToday,
}: {
  copy: DemoCopy;
  interactive?: boolean;
  onOpenToday?: () => void;
}) {
  const cardClassName = cn(
    "block w-full rounded-compact bg-neutral-100 px-3 py-2.5 text-left transition-colors dark:bg-muted/45",
    interactive &&
      "group cursor-pointer hover:bg-neutral-200 dark:hover:bg-muted",
  );

  const inner = (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-compact bg-background text-xs font-semibold text-muted-foreground dark:bg-black/20">
        1
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="truncate text-sm font-semibold">
            {copy.todayExecution.workoutTitle}
          </div>
          <span className="shrink-0 rounded-compact bg-background px-2 py-0.5 text-[10px] text-muted-foreground dark:bg-black/20">
            {copy.todayExecution.status}
          </span>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
          <span className="shrink-0">{copy.todayExecution.sport}</span>
          <span className="flex shrink-0 items-center gap-1">
            <Clock3 className="h-3.5 w-3.5" />
            {copy.todayExecution.duration}
          </span>
          <span className="truncate">{copy.todayExecution.focus}</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" />
          <span className="truncate">{copy.todayExecution.linked}</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            disabled={interactive}
            onClick={(event) => event.stopPropagation()}
            className="rounded-compact bg-background px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-neutral-200 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 dark:bg-black/20 dark:hover:bg-muted"
          >
            {copy.todayExecution.actionPostpone}
          </button>
          <button
            type="button"
            disabled={interactive}
            onClick={(event) => event.stopPropagation()}
            className="rounded-compact bg-background px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-neutral-200 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 dark:bg-black/20 dark:hover:bg-muted"
          >
            {copy.todayExecution.actionSkip}
          </button>
          <button
            type="button"
            disabled
            title={copy.todayExecution.deleteDisabledTip}
            onClick={(event) => event.stopPropagation()}
            className="rounded-compact bg-background px-2 py-1 text-[11px] text-muted-foreground/60 dark:bg-black/20"
          >
            {copy.todayExecution.actionDelete}
          </button>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold">1</div>
        <div className="text-[10px] text-muted-foreground">
          {copy.todayExecution.session}
        </div>
      </div>
      {interactive ? (
        <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground sm:block" />
      ) : null}
    </div>
  );

  if (interactive && onOpenToday) {
    return (
      <button type="button" onClick={onOpenToday} className={cardClassName}>
        {inner}
      </button>
    );
  }

  return <div className={cardClassName}>{inner}</div>;
}

function TodayExecutionPanel({
  copy,
  interactive,
  onOpenToday,
}: {
  copy: DemoCopy;
  interactive?: boolean;
  onOpenToday?: () => void;
}) {
  const enterTodayClassName = cn(
    "flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors",
    interactive && "cursor-pointer hover:text-foreground",
  );

  return (
    <SoftPanel className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-baseline gap-1.5">
          <h2 className="text-sm font-semibold text-foreground">
            {copy.todayExecution.title}
          </h2>
          <p className="text-xs text-muted-foreground">
            ｜ {copy.todayExecution.meta}
          </p>
        </div>
        {interactive && onOpenToday ? (
          <button
            type="button"
            onClick={onOpenToday}
            className={enterTodayClassName}
          >
            {copy.todayExecution.enterToday}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className={enterTodayClassName}>
            {copy.todayExecution.enterToday}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="space-y-3">
        <TodayExecutionWorkoutCard
          copy={copy}
          interactive={interactive}
          onOpenToday={onOpenToday}
        />
      </div>
    </SoftPanel>
  );
}

function RecentActivityThumbnail() {
  return (
    <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-compact bg-background dark:bg-black/20">
      <svg viewBox="0 0 64 56" className="h-full w-full">
        <path
          d="M0 18H64M0 38H64M18 0V56M43 0V56"
          fill="none"
          stroke="currentColor"
          className="text-border/60"
          strokeWidth="1"
        />
        <path
          d="M9 42C13 35 18 34 23 37C29 41 33 34 30 28C27 22 34 18 40 21C47 25 51 16 56 10"
          fill="none"
          stroke="#10b981"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3.5"
        />
        <circle cx="9" cy="42" r="2.2" fill="#10b981" />
        <circle cx="56" cy="10" r="2.2" fill="#10b981" />
      </svg>
    </div>
  );
}

function RecentActivityPanel({ copy }: { copy: DemoCopy }) {
  return (
    <SoftPanel className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {copy.recentActivity.titleSection}
        </h2>
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-compact text-muted-foreground"
          aria-hidden
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="space-y-3">
        {copy.recentActivity.items.map((activity) => (
          <div
            key={activity.title}
            className="flex items-center gap-3 rounded-compact bg-neutral-100 p-2.5 dark:bg-muted/45"
          >
            <RecentActivityThumbnail />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {activity.title}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {activity.time}
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {activity.summary}
              </div>
            </div>
            <span className="shrink-0 rounded-compact bg-background px-2 py-0.5 text-[10px] text-muted-foreground dark:bg-black/20">
              {activity.status}
            </span>
          </div>
        ))}
      </div>
    </SoftPanel>
  );
}

function HomeUploadTrainingDesktop({
  copy,
  disabled,
}: {
  copy: DemoCopy;
  disabled?: boolean;
}) {
  return (
    <SoftPanel>
      <SectionTitle title={copy.upload.title} />
      <div className="rounded-compact bg-neutral-100 p-4 text-center dark:bg-muted/45">
        <FileUp className="mx-auto h-6 w-6 text-muted-foreground" />
        <div className="mt-2 text-sm font-semibold">
          {copy.upload.cardTitle}
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {copy.upload.description}
        </p>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "mt-3 inline-flex w-full max-w-[220px] items-center justify-center rounded-compact px-3 py-2 text-sm font-medium transition-opacity",
            disabled
              ? "cursor-not-allowed bg-muted text-muted-foreground opacity-70"
              : "bg-foreground text-background hover:opacity-90",
          )}
        >
          {copy.upload.selectFile}
        </button>
      </div>
    </SoftPanel>
  );
}

function HomeTwoColumnSection({
  copy,
  interactive,
  onOpenMetric,
  onFitnessCardClick,
  onOpenToday,
}: {
  copy: DemoCopy;
  interactive: boolean;
  onOpenMetric: (key: SummaryMetricKey) => void;
  onFitnessCardClick: (stat: FitnessStatCard) => void;
  onOpenToday: () => void;
}) {
  return (
    <div
      className={
        "flex flex-col gap-2 " +
        "md:grid md:grid-cols-[minmax(0,1fr)_320px] md:items-start md:gap-3 " +
        "md:grid-rows-[auto_auto_auto] " +
        "md:[grid-template-areas:'main_state'_'main_recent'_'main_upload']"
      }
    >
      <main className="contents md:flex md:min-h-0 md:min-w-0 md:flex-col md:gap-3 md:[grid-area:main] md:order-none">
        <div className="order-2 min-w-0 md:order-none">
          <LoadComparisonChart copy={copy} interactive={interactive} />
        </div>
        <div className="order-1 min-w-0 md:order-none">
          <TodayExecutionPanel
            copy={copy}
            interactive={interactive}
            onOpenToday={interactive ? onOpenToday : undefined}
          />
        </div>
        <div className="order-4 min-w-0 md:order-none">
          <SummaryPanel
            copy={copy}
            interactive={interactive}
            onOpenMetric={onOpenMetric}
          />
        </div>
      </main>
      <div className="order-3 min-w-0 md:[grid-area:state] md:order-none">
        <CurrentStatePanel
          copy={copy}
          interactive={interactive}
          onFitnessCardClick={interactive ? onFitnessCardClick : undefined}
        />
      </div>
      <div className="order-5 min-w-0 md:[grid-area:recent] md:order-none">
        <RecentActivityPanel copy={copy} />
      </div>
      <div className="order-7 hidden min-w-0 md:block md:[grid-area:upload] md:order-none">
        <HomeUploadTrainingDesktop copy={copy} disabled={interactive} />
      </div>
    </div>
  );
}

function CoachSuggestionPreview({
  copy,
  lang,
}: {
  copy: DemoCopy;
  lang: string;
}) {
  return (
    <section className="min-w-0 space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 pr-10 md:pr-0">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">
            {copy.today.title} · {copy.today.date} · {copy.today.weekday}
          </span>
        </div>
        <div className="flex h-0 items-center">
          <a
            href={`/${lang}/ai-coach`}
            className="pointer-events-auto inline-flex h-8 max-w-36 shrink-0 items-center gap-1.5 rounded-compact bg-foreground px-3 text-[11px] font-semibold text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:max-w-none"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
            <span className="truncate">{copy.today.askCoach}</span>
          </a>
        </div>
      </div>

      <a
        href={`/${lang}/ai-coach`}
        aria-label={`${copy.today.title}: ${copy.today.summary}`}
        className="group flex min-h-[150px] min-w-0 flex-col justify-between gap-3 overflow-hidden rounded-feature bg-neutral-100 p-3 text-left text-foreground transition-colors hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-[#292b2a] dark:hover:bg-muted md:rounded-compact"
      >
        <span className="line-clamp-5 text-sm font-medium leading-5">
          {copy.today.summary}
        </span>
        <span className="flex flex-wrap gap-1.5">
          {copy.today.tags.slice(0, 3).map((tag, index) => (
            <span
              key={`${tag}-${index}`}
              className="rounded-compact bg-white/90 px-2 py-1 text-[11px] text-muted-foreground dark:bg-black/28"
            >
              {tag}
            </span>
          ))}
        </span>
      </a>
    </section>
  );
}

function CurrentPlanPreview({ copy, lang }: { copy: DemoCopy; lang: string }) {
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarRange className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{copy.currentPlan.title}</span>
      </div>

      <a
        href={`/${lang}/plan`}
        className="group flex min-h-[150px] min-w-0 flex-col rounded-feature bg-neutral-100 p-3 text-foreground transition-colors hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-muted/45 dark:hover:bg-muted md:rounded-compact"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 truncate text-base font-semibold leading-6 tracking-normal">
            {copy.currentPlan.cycle}
          </span>
          <span className="inline-flex shrink-0 rounded-compact bg-white/92 px-2 py-1 text-[11px] text-muted-foreground dark:bg-black/30">
            {copy.currentPlan.weekTarget}
            <span className="ml-1 font-semibold text-foreground">
              {copy.currentPlan.weekTargetLoad}
            </span>
          </span>
        </div>

        <div className="mt-3 flex min-w-0 items-start gap-2.5">
          <span className="shrink-0 whitespace-nowrap rounded-compact bg-white/88 px-2 py-1 text-[11px] text-muted-foreground dark:bg-black/28">
            {copy.currentPlan.weekLabel}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-muted-foreground">
              {copy.todayExecution.title}
            </div>
            <div className="mt-0.5 truncate text-sm font-medium leading-5">
              {copy.todayExecution.workoutTitle}
            </div>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-foreground/8 pt-2.5 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground dark:border-white/8">
          <span>{copy.currentPlan.viewCurrentPlan}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </div>
      </a>
    </div>
  );
}

export function HomeProductDemo({
  lang,
  variant = "preview",
}: {
  lang: string;
  variant?: "preview" | "expanded";
}) {
  const copy = resolveDemoCopy(demoCopy, lang);
  const metricCopy = resolveDemoCopy(metricDemoCopy, lang);
  const isExpanded = variant === "expanded";
  const [view, setView] = useState<HomeDemoView>("home");
  const [metricDialog, setMetricDialog] = useState<MetricHistoryDialogState>(
    createInitialMetricHistoryDialogState,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const setLightboxBack = useHomeDemoLightboxBack();

  const openFitnessCard = (stat: FitnessStatCard) => {
    const key = stat.key as FitnessMetricKey;
    setMetricDialog({
      open: true,
      key,
      title: stat.title,
      currentValue: stat.value,
      unit: stat.unit ?? "",
      description: stat.details ?? stat.description,
      links: [buildMetricDocsLink(key, stat.title, lang, copy.aboutMetric)],
    });
  };

  const openToday = () => setView("day");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [view]);

  useEffect(() => {
    if (!isExpanded || view === "home" || !setLightboxBack) {
      return;
    }

    setLightboxBack({
      ariaLabel: metricCopy.back,
      onClick: () => setView("home"),
    });

    return () => setLightboxBack(null);
  }, [isExpanded, view, metricCopy.back, setLightboxBack]);

  return (
    <div
      className={cn(
        "client-demo-radius flex flex-col bg-background text-foreground",
        isExpanded
          ? "flex h-full min-h-0 w-full flex-col"
          : "h-[600px] overflow-hidden p-3 md:h-[700px] lg:h-[750px]",
      )}
      style={
        isExpanded
          ? undefined
          : { height: "min(750px, max(600px, calc(100vw - 68px)))" }
      }
      data-demo-mode={variant}
    >
      <div
        ref={scrollRef}
        className={cn(
          "mx-auto flex w-full max-w-6xl flex-col gap-2 pb-2 md:gap-3",
          isExpanded ? "min-h-0 flex-1" : "min-h-0 flex-1 overflow-y-auto",
        )}
      >
        {view === "home" ? (
          <>
            <header className="px-1 py-1">
              <div className="grid gap-2 md:grid-cols-[3fr_2fr] md:gap-2">
                <CoachSuggestionPreview copy={copy} lang={lang} />
                <CurrentPlanPreview copy={copy} lang={lang} />
              </div>
            </header>

            <HomeTwoColumnSection
              copy={copy}
              interactive={isExpanded}
              onOpenMetric={(key) => setView(summaryKeyToView(key))}
              onFitnessCardClick={openFitnessCard}
              onOpenToday={openToday}
            />

            {isExpanded ? (
              <MetricHistoryDemoDialog
                state={metricDialog}
                onOpenChange={(open) =>
                  setMetricDialog((current) => ({ ...current, open }))
                }
              />
            ) : null}
          </>
        ) : view === "day" ? (
          <HomeDayDemoApp
            lang={lang}
            sourceCopy={{
              currentPlan: copy.currentPlan,
              today: copy.today,
              todayExecution: copy.todayExecution,
            }}
            onBackHome={() => setView("home")}
          />
        ) : (
          <MetricDemoApp lang={lang} view={view} />
        )}
      </div>
    </div>
  );
}
