import {
  getRunPlanTemplate,
  normalizePlanTemplateLocale,
} from "@shared/plan-templates";
import {
  HALF_MARATHON_PLAN_FACTS,
  isHalfMarathonIndexedLocale,
} from "./half-marathon-training-plan-copy";
import {
  MARATHON_PLAN_FACTS,
  isMarathonIndexedLocale,
} from "./marathon-training-plan-copy";
import {
  TEN_K_PLAN_FACTS,
  isTenKIndexedLocale,
} from "./ten-k-training-plan-copy";

export const runningPlanSlugs = [
  "couch-to-5k-training-plan",
  "5k-training-plan",
  "5k-training-plan-intermediate",
  "10k-training-plan",
  "half-marathon-training-plan",
  "marathon-training-plan",
] as const;

export type RunningPlanSlug = (typeof runningPlanSlugs)[number];

export type RunningPlan = {
  slug: RunningPlanSlug;
  /** Public URL; kept separate because some plans use nested routes. */
  routePath?: string;
  templateSlug?:
    | "first-5k"
    | "finish-5k"
    | "improve-5k"
    | "finish-10k"
    | "finish-half-marathon"
    | "finish-marathon";
  distance: string;
  sport: "Running";
  weeks: string;
  level: string;
  weeklyVolume: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  eyebrow: string;
  title: string;
  subtitle: string;
  primaryCta: string;
  primaryCtaTarget?: "app" | "schedule";
  secondaryCta: string;
  secondaryCtaTarget?: "app" | "plan-hub";
  conversionCta?: string;
  finalCta?: string;
  finalTitle?: string;
  finalText?: string;
  collectionCta?: string;
  trustItems?: string[];
  promise: string;
  planChooser?: {
    title: string;
    subtitle: string;
    options: Array<{
      label: string;
      title: string;
      description: string;
      href: string | null;
    }>;
  };
  forTitle: string;
  forItems: string[];
  previewTitle: string;
  previewSubtitle: string;
  previewRows: Array<[string, string, string]>;
  contentTitle?: string;
  contentSubtitle?: string;
  contentSections?: Array<[string, string, string[]]>;
  conversionTitle?: string;
  conversionText?: string;
  aiTitle: string;
  aiSubtitle: string;
  aiSignals: Array<[string, string]>;
  relatedTitle?: string;
  relatedLinks?: Array<[string, string, string]>;
  faq: Array<[string, string]>;
  howToTitle?: string;
  howToDescription?: string;
  howToSteps?: Array<[string, string]>;
  howToTotalTime?: string;
};

export function createCouchTo5kPlan(
  localizedPlan: RunningPlan,
  lang = "en",
): RunningPlan {
  const loopLinks = productLoopRelatedLinks(lang).filter(
    ([, href]) => href !== "/vdot-calculator",
  );
  return {
    ...localizedPlan,
    slug: "couch-to-5k-training-plan",
    routePath: "/couch-to-5k-training-plan",
    templateSlug: "first-5k",
    planChooser: createFiveKPlanChooser(lang, "couch"),
    relatedLinks: mergeRelatedLinks(
      mergeRelatedLinks(
        localizedPlan.relatedLinks,
        fiveKHubRelatedLink(lang, "couch"),
      ),
      loopLinks,
    ),
  };
}

type PlanCopyLocale = "en" | "zh" | "zh-hant" | "ja";

function planCopyLocale(lang: string): PlanCopyLocale {
  if (lang === "zh-hant") return "zh-hant";
  if (lang.startsWith("zh")) return "zh";
  if (lang === "ja") return "ja";
  return "en";
}

type FiveKChooserVariant = "couch" | "finish" | "intermediate";
type RaceDistance = "10k" | "half-marathon" | "marathon";

const fiveKChooserLabels: Record<
  PlanCopyLocale,
  { options: [string, string, string]; current: string }
> = {
  en: {
    options: ["Starting from zero", "Running 20–30 minutes", "Already racing"],
    current: "Current plan",
  },
  zh: {
    options: ["从零开始", "能连续跑 20–30 分钟", "已有比赛基础"],
    current: "当前计划",
  },
  "zh-hant": {
    options: ["從零開始", "能連續跑 20–30 分鐘", "已有比賽基礎"],
    current: "目前計畫",
  },
  ja: {
    options: ["ゼロから始める", "20〜30分走れる", "レース経験あり"],
    current: "現在のプラン",
  },
};

function createFiveKPlanChooser(
  lang: string,
  current: FiveKChooserVariant,
): NonNullable<RunningPlan["planChooser"]> {
  const locale = planCopyLocale(lang);
  const source = fiveKCopy[locale]?.planChooser ?? fiveKCopy.en.planChooser!;
  const labels = fiveKChooserLabels[locale];
  const routes = [
    "/couch-to-5k-training-plan",
    "/5k-training-plan",
    "/5k-training-plan/intermediate",
  ] as const;
  const currentIndex = { couch: 0, finish: 1, intermediate: 2 }[current];

  return {
    ...source,
    options: source.options.map((option, index) => ({
      ...option,
      label: index === currentIndex ? labels.current : labels.options[index],
      href: index === currentIndex ? null : routes[index],
    })),
  };
}

const raceDistanceChooserCopy: Record<
  PlanCopyLocale,
  Record<
    RaceDistance,
    {
      title: string;
      subtitle: string;
      options: Array<{
        label: string;
        title: string;
        description: string;
      }>;
    }
  >
> = {
  en: {
    "10k": {
      title: "Choose the right 10K plan",
      subtitle:
        "Start with your current running base and goal, not the fastest-looking schedule.",
      options: [
        {
          label: "Finish",
          title: "First 10K",
          description:
            "Ten weeks, three runs per week and no required threshold work.",
        },
        {
          label: "Improve",
          title: "Run a faster 10K",
          description:
            "Add repeatable quality work after a first finish is comfortable.",
        },
        {
          label: "Target",
          title: "Train for a goal time",
          description:
            "Use a recent result and race date to set a specific target.",
        },
      ],
    },
    "half-marathon": {
      title: "Choose the right half marathon plan",
      subtitle:
        "Match the plan to your current long-run base and whether you want to finish or race.",
      options: [
        {
          label: "Finish",
          title: "First half marathon",
          description:
            "Fourteen weeks with four runs per week and a gradual long run.",
        },
        {
          label: "Improve",
          title: "Improve your half marathon",
          description:
            "Build sustainable quality after the distance is familiar.",
        },
        {
          label: "Target",
          title: "Train for a goal time",
          description:
            "Turn a recent race result into a specific race-day target.",
        },
      ],
    },
    marathon: {
      title: "Choose the right marathon plan",
      subtitle:
        "Your long-run base and race goal decide whether you should finish, improve or target a time.",
      options: [
        {
          label: "Finish",
          title: "First marathon",
          description:
            "Eighteen weeks, four runs per week and a protected three-week taper.",
        },
        {
          label: "Improve",
          title: "Improve your marathon",
          description:
            "Add controlled quality after marathon training is repeatable.",
        },
        {
          label: "Target",
          title: "Train for a goal time",
          description:
            "Use current fitness and race date to pursue a specific result.",
        },
      ],
    },
  },
  zh: {
    "10k": {
      title: "选择适合你的 10 公里计划",
      subtitle: "先看当前跑步基础和目标，不要直接选择看起来最难的课表。",
      options: [
        {
          label: "完赛",
          title: "首次完成 10 公里",
          description: "10 周、每周三跑，不要求阈值或间歇训练。",
        },
        {
          label: "进阶",
          title: "提高 10 公里成绩",
          description: "已经能轻松完赛后，再加入可重复的质量训练。",
        },
        {
          label: "目标",
          title: "按目标成绩备赛",
          description: "根据近期成绩和比赛日期，安排更具体的训练。",
        },
      ],
    },
    "half-marathon": {
      title: "选择适合你的半马计划",
      subtitle: "根据当前长跑基础，选择首次完赛、进阶提高或目标成绩。",
      options: [
        {
          label: "完赛",
          title: "首次完成半马",
          description: "14 周、每周四跑，逐步延长长跑时间。",
        },
        {
          label: "进阶",
          title: "提高半马成绩",
          description: "熟悉半马距离后，再加入稳定可控的质量训练。",
        },
        {
          label: "目标",
          title: "按目标成绩备赛",
          description: "用近期比赛成绩和目标赛事制定专项安排。",
        },
      ],
    },
    marathon: {
      title: "选择适合你的马拉松计划",
      subtitle: "当前长跑基础和比赛目标，决定你该先完赛、进阶还是冲击成绩。",
      options: [
        {
          label: "完赛",
          title: "完成首场马拉松",
          description: "18 周、每周四跑，并保留完整的三周减量。",
        },
        {
          label: "进阶",
          title: "提高马拉松成绩",
          description: "已经稳定完成马拉松训练后，再增加可控质量课。",
        },
        {
          label: "目标",
          title: "按目标成绩备赛",
          description: "结合当前能力和比赛日期，准备更明确的目标。",
        },
      ],
    },
  },
  "zh-hant": {
    "10k": {
      title: "選擇適合你的 10 公里計畫",
      subtitle: "先看目前跑步基礎和目標，不要直接選擇看起來最難的課表。",
      options: [
        {
          label: "完賽",
          title: "首次完成 10 公里",
          description: "10 週、每週三跑，不要求閾值或間歇訓練。",
        },
        {
          label: "進階",
          title: "提高 10 公里成績",
          description: "已經能輕鬆完賽後，再加入可重複的品質訓練。",
        },
        {
          label: "目標",
          title: "按目標成績備賽",
          description: "根據近期成績和比賽日期，安排更具體的訓練。",
        },
      ],
    },
    "half-marathon": {
      title: "選擇適合你的半馬計畫",
      subtitle: "根據目前長跑基礎，選擇首次完賽、進階提高或目標成績。",
      options: [
        {
          label: "完賽",
          title: "首次完成半馬",
          description: "14 週、每週四跑，逐步延長長跑時間。",
        },
        {
          label: "進階",
          title: "提高半馬成績",
          description: "熟悉半馬距離後，再加入穩定可控的品質訓練。",
        },
        {
          label: "目標",
          title: "按目標成績備賽",
          description: "用近期比賽成績和目標賽事制定專項安排。",
        },
      ],
    },
    marathon: {
      title: "選擇適合你的馬拉松計畫",
      subtitle: "目前長跑基礎和比賽目標，決定你該先完賽、進階還是挑戰成績。",
      options: [
        {
          label: "完賽",
          title: "完成首場馬拉松",
          description: "18 週、每週四跑，並保留完整的三週減量。",
        },
        {
          label: "進階",
          title: "提高馬拉松成績",
          description: "已能穩定完成馬拉松訓練後，再增加可控品質課。",
        },
        {
          label: "目標",
          title: "按目標成績備賽",
          description: "結合目前能力和比賽日期，準備更明確的目標。",
        },
      ],
    },
  },
  ja: {
    "10k": {
      title: "自分に合う10kmプランを選ぶ",
      subtitle: "難しさではなく、現在の走力と目標に合うメニューから始めます。",
      options: [
        {
          label: "完走",
          title: "初めての10km",
          description:
            "10週間・週3回で、閾値走やインターバルは必須ではありません。",
        },
        {
          label: "向上",
          title: "10kmを速く走る",
          description:
            "余裕を持って完走できてから、再現できる質の練習を加えます。",
        },
        {
          label: "目標",
          title: "目標タイムに向ける",
          description: "最近の記録とレース日から具体的な目標を設定します。",
        },
      ],
    },
    "half-marathon": {
      title: "自分に合うハーフマラソンプランを選ぶ",
      subtitle: "現在のロング走の土台と、完走か記録かという目標に合わせます。",
      options: [
        {
          label: "完走",
          title: "初めてのハーフ",
          description: "14週間・週4回でロング走を段階的に伸ばします。",
        },
        {
          label: "向上",
          title: "ハーフの記録を伸ばす",
          description:
            "距離に慣れてから、無理なく続けられる質の練習を加えます。",
        },
        {
          label: "目標",
          title: "目標タイムに向ける",
          description: "最近のレース結果から具体的なレース目標を作ります。",
        },
      ],
    },
    marathon: {
      title: "自分に合うフルマラソンプランを選ぶ",
      subtitle:
        "ロング走の土台とレース目標から、完走・向上・目標タイムを選びます。",
      options: [
        {
          label: "完走",
          title: "初めてのフルマラソン",
          description: "18週間・週4回で、3週間のテーパリングを守ります。",
        },
        {
          label: "向上",
          title: "マラソン記録を伸ばす",
          description:
            "マラソン練習を継続できてから、管理された質の練習を加えます。",
        },
        {
          label: "目標",
          title: "目標タイムに向ける",
          description: "現在の走力とレース日から具体的な結果を目指します。",
        },
      ],
    },
  },
};

function createRaceDistancePlanChooser(
  lang: string,
  distance: RaceDistance,
): NonNullable<RunningPlan["planChooser"]> {
  const copy = raceDistanceChooserCopy[planCopyLocale(lang)][distance];
  const basePath =
    distance === "10k"
      ? "/10k-training-plan"
      : distance === "half-marathon"
        ? "/half-marathon-training-plan"
        : "/marathon-training-plan";
  const hrefs = [null, `${basePath}/improve`, `${basePath}/target`] as const;

  return {
    title: copy.title,
    subtitle: copy.subtitle,
    options: copy.options.map((option, index) => ({
      ...option,
      href: hrefs[index] ?? null,
    })),
  };
}

function fiveKHubRelatedLink(
  lang: string,
  variant: Exclude<FiveKChooserVariant, "finish">,
): Array<[string, string, string]> {
  const locale = planCopyLocale(lang);
  if (variant === "couch") {
    if (locale === "zh") {
      return [
        [
          "查看 5 公里训练计划主页",
          "/5k-training-plan",
          "比较从零跑走、完赛与进阶提速三种 5 公里计划。",
        ],
      ];
    }
    if (locale === "zh-hant") {
      return [
        [
          "查看 5K 訓練計畫主頁",
          "/5k-training-plan",
          "比較從零跑走、完賽與進階提速三種 5K 計畫。",
        ],
      ];
    }
    if (locale === "ja") {
      return [
        [
          "5Kプランのメインページを見る",
          "/5k-training-plan",
          "ラン・ウォーク、完走、中級の3つの5Kプランを比較します。",
        ],
      ];
    }
    return [
      [
        "Explore the 5K training plan hub",
        "/5k-training-plan",
        "Compare run-walk, first-finish, and intermediate 5K plans.",
      ],
    ];
  }
  return [];
}

/** Action links that keep distance hubs inside the product loop. */
export function productLoopRelatedLinks(
  lang: string,
): Array<[string, string, string]> {
  const locale = planCopyLocale(lang);
  if (locale === "zh") {
    return [
      [
        "用 AI 教练按训练负荷调整计划",
        "/ai-training-plan",
        "根据完成训练和负荷生成可确认的调整草案，而不是沿用固定日历。",
      ],
      [
        "用 VDOT 计算训练配速",
        "/vdot-calculator",
        "用近期成绩建立可验证的配速锚点。",
      ],
      [
        "用时间和距离计算跑步配速",
        "/running-pace-calculator",
        "换算配速、用时和距离，或生成 5 公里到马拉松的均匀分段表。",
      ],
      [
        "用近期成绩预测完赛时间",
        "/race-time-predictor",
        "从一场近期比赛或已知配速预测 5 公里、10 公里、半马和全马完赛时间。",
      ],
      [
        "在计划里管理训练负荷",
        "/training-load",
        "在增加跑量或强度前，先查看 CTL、ATL 和 TSB。",
      ],
    ];
  }
  if (locale === "zh-hant") {
    return [
      [
        "用 AI 教練依訓練負荷調整計畫",
        "/ai-training-plan",
        "根據完成訓練和負荷產生可確認的調整草案，而不是沿用固定日曆。",
      ],
      [
        "用 VDOT 計算訓練配速",
        "/vdot-calculator",
        "用近期成績建立可驗證的配速基準。",
      ],
      [
        "用時間和距離計算跑步配速",
        "/running-pace-calculator",
        "換算配速、時間和距離，或產生 5 公里到馬拉松的均勻分段表。",
      ],
      [
        "用近期成績預測完賽時間",
        "/race-time-predictor",
        "從一場近期比賽或已知配速預測 5 公里、10 公里、半馬和全馬完賽時間。",
      ],
      [
        "在計畫裡管理訓練負荷",
        "/training-load",
        "在增加跑量或強度前，先查看 CTL、ATL 和 TSB。",
      ],
    ];
  }
  if (locale === "ja") {
    return [
      [
        "AIコーチで負荷に合わせて計画を調整",
        "/ai-training-plan",
        "完了した練習と負荷から確認可能な変更案を作り、固定カレンダーのままにしません。",
      ],
      [
        "VDOTでトレーニングペースを確認",
        "/vdot-calculator",
        "最近の記録を、制御されたトレーニングペースの参考にします。",
      ],
      [
        "タイムと距離からランニングペースを計算",
        "/running-pace-calculator",
        "ペース、タイム、距離を換算し、5Kからマラソンまでの等分割表を作ります。",
      ],
      [
        "最近の記録からレースタイムを予測する",
        "/race-time-predictor",
        "直近のレースまたは既知ペースから 5K・10K・ハーフ・マラソンの完走タイムを予測します。",
      ],
      [
        "計画内でトレーニング負荷を管理する",
        "/training-load",
        "走行量や強度を増やす前に、CTL、ATL、TSBを確認します。",
      ],
    ];
  }
  return [
    [
      "Use AI to adjust training load in your plan",
      "/ai-training-plan",
      "Draft confirmable changes from completed runs and load, not a fixed calendar.",
    ],
    [
      "Calculate VDOT training paces",
      "/vdot-calculator",
      "Use a recent result as a verifiable pace anchor.",
    ],
    [
      "Calculate running pace from time and distance",
      "/running-pace-calculator",
      "Convert pace, time, and distance, or build an even-split chart from 5K to marathon.",
    ],
    [
      "Predict race finish times from a recent result",
      "/race-time-predictor",
      "Turn a recent race or known pace into 5K, 10K, half, and marathon finish-time estimates.",
    ],
    [
      "Manage training load in your plan",
      "/training-load",
      "Check CTL, ATL, and TSB before adding volume or intensity.",
    ],
  ];
}

function mergeRelatedLinks(
  existing: Array<[string, string, string]> | undefined,
  extras: Array<[string, string, string]>,
) {
  const merged = [...(existing ?? [])];
  const seen = new Set(merged.map(([, href]) => href));
  for (const link of extras) {
    if (seen.has(link[1])) continue;
    merged.push(link);
    seen.add(link[1]);
  }
  return merged;
}

const fiveKCopy: Record<string, Partial<RunningPlan>> = {
  en: {
    weeks: "8 weeks",
    level: "Beginner to intermediate",
    weeklyVolume: "4 runs/week",
    metaTitle: "Free 8-Week 5K Training Plan for Beginners",
    metaDescription:
      "Free 8-week 5K training plan for runners who can already run 20–30 minutes. Four runs a week, easy volume, one steady session, and a short taper.",
    keywords: [
      "5k training plan",
      "5k running plan",
      "5k training schedule",
      "beginner 5k training plan",
      "8 week 5k plan",
    ],
    eyebrow: "8-week 5K running plan",
    title: "5K training plan: free 8-week beginner schedule",
    subtitle:
      "This 5K plan is for runners who can already complete 20 to 30 minutes of easy running and want a clear race schedule. It combines conversational runs, one controlled quality session, a weekly long run, recovery, and a short taper before race day.",
    primaryCta: "Personalize my 5K plan",
    secondaryCta: "Browse all plans",
    promise:
      "The full schedule is free below. Personalize it when your available days, recent training, pace, or recovery make a generic calendar a poor fit.",
    planChooser: {
      title: "Choose the right 5K plan",
      subtitle:
        "Start with the plan that matches what you can run today. Each option has a different starting point and training load.",
      options: [
        {
          label: "Starting from zero",
          title: "Couch to 5K",
          description:
            "Use a run-walk progression if 20 minutes of continuous easy running is not comfortable yet.",
          href: "/couch-to-5k-training-plan",
        },
        {
          label: "Current plan",
          title: "Finish a 5K",
          description:
            "Choose this 8-week plan if you can already run easily for 20–30 minutes and can train four days a week.",
          href: null,
        },
        {
          label: "Already racing",
          title: "Run a faster 5K",
          description:
            "Use the intermediate plan when you have a recent 5K result and want structured intervals and tempo work.",
          href: "/5k-training-plan/intermediate",
        },
      ],
    },
    trustItems: [
      "Full schedule free",
      "8 weeks",
      "4 runs per week",
      "20–30 minute running base",
    ],
    forTitle: "Who this 5K training plan is for",
    forItems: [
      "You can run easily for 20 to 30 minutes without needing a run-walk progression.",
      "You want to finish a first 5K confidently or improve a recent 5K without training every run hard.",
      "You can protect four running days per week, including one quality session and one longer easy run.",
      "You are not currently managing pain, illness, or an injury that changes your running form.",
    ],
    previewTitle: "How the 8-week 5K plan progresses",
    previewSubtitle:
      "The plan builds from repeatable easy running to 5K-specific work, then reduces fatigue before race day. The complete day-by-day schedule follows below.",
    previewRows: [
      [
        "Weeks 1-2",
        "Establish the rhythm",
        "Keep most running easy and introduce relaxed strides or short hills.",
      ],
      [
        "Weeks 3-6",
        "Build 5K strength",
        "Alternate controlled intervals and tempo work while the long run grows gradually.",
      ],
      [
        "Weeks 7-8",
        "Taper and race",
        "Reduce volume, keep a little speed, and arrive at the 5K fresh.",
      ],
    ],
    contentTitle: "What makes this a practical 5K plan",
    contentSubtitle:
      "A useful 5K schedule separates easy volume from quality work, gives each session a purpose, and leaves enough recovery to repeat the week consistently.",
    contentSections: [
      [
        "Easy volume",
        "Easy runs build consistency without turning every day into a test.",
        [
          "Use conversational effort",
          "Slow down for heat and hills",
          "Keep recovery days intact",
        ],
      ],
      [
        "One quality session",
        "Intervals, hills, or tempo running develop 5K-specific speed without dominating the week.",
        [
          "Run repetitions with control",
          "Stop before form deteriorates",
          "Do not replace missed easy runs with intensity",
        ],
      ],
      [
        "Long run and taper",
        "A modest long run supports endurance; the final week cuts fatigue while preserving rhythm.",
        [
          "Keep the long run easy",
          "Reduce volume before race day",
          "Avoid last-minute fitness tests",
        ],
      ],
    ],
    conversionTitle: "Turn the free 5K schedule into your calendar",
    conversionText:
      "Choose your race date, available days, current pace, and recent training. Trainingload.ai can draft the schedule around those constraints and keep later changes reviewable before they reach your calendar.",
    aiTitle: "How Trainingload.ai personalizes a 5K plan",
    aiSubtitle:
      "The public schedule answers what to do. Personalization decides where sessions fit, which pace anchors apply, and whether completed runs support building, holding, or recovering.",
    aiSignals: [
      [
        "Plan versus actual",
        "Compare the intended workout with the run you completed instead of judging pace alone.",
      ],
      [
        "Training load",
        "Review recent load and recovery before increasing volume or adding another hard session.",
      ],
      [
        "Confirmed changes",
        "AI drafts a change; you or your coach confirms it before the calendar is updated.",
      ],
    ],
    relatedTitle: "Continue your running plan",
    relatedLinks: [
      [
        "Starting from zero? Use Couch to 5K",
        "/couch-to-5k-training-plan",
        "Use a run-walk progression if 20 minutes of continuous easy running is not yet comfortable.",
      ],
      [
        "Build from 5K to 10K",
        "/10k-training-plan",
        "Extend endurance and threshold work with the complete 10K schedule.",
      ],
      [
        "Set training paces with VDOT",
        "/vdot-calculator",
        "Use a recent performance as one reference for controlled training paces.",
      ],
    ],
    faq: [
      [
        "How long should I train for a 5K?",
        "This schedule uses eight weeks. Runners with less base fitness may need longer; runners already training consistently may enter later only after reviewing the workload.",
      ],
      [
        "How many days per week should I run?",
        "The plan uses four running days. Keep the easy days easy and preserve rest or strength days between harder sessions.",
      ],
      [
        "Is this a beginner 5K plan?",
        "Yes, for a beginner who can already run easily for 20 to 30 minutes. Complete non-runners should use the separate Couch to 5K plan.",
      ],
      [
        "What if I miss a workout?",
        "Skip it or move it only when recovery remains protected. Do not stack two quality sessions or cram missed mileage into the weekend.",
      ],
      [
        "Can AI change the plan automatically?",
        "Trainingload.ai can draft adjustments from completed runs and training load, but the calendar updates only after you confirm.",
      ],
    ],
  },
  zh: {
    weeks: "8 周",
    level: "新手到进阶",
    weeklyVolume: "每周 4 次跑步",
    metaTitle: "免费 8 周 5 公里训练计划：新手完赛安排",
    metaDescription:
      "给已能连续跑 20–30 分钟的跑者：免费 8 周 5 公里训练计划，每周 4 跑，含轻松跑、受控稳定跑、长跑和赛前减量。",
    keywords: [
      "5 公里训练计划",
      "5k training plan",
      "5 公里跑步计划",
      "5 公里训练安排",
      "8 周 5 公里计划",
    ],
    eyebrow: "8 周 5 公里跑步计划",
    title: "免费 8 周 5 公里训练计划：面向新手完赛。",
    subtitle:
      "这份 5 公里计划适合已经能轻松连续跑 20-30 分钟、希望有明确备赛安排的跑者。计划结合可对话强度的轻松跑、每周一次可控质量课、一次长距离、恢复和赛前短减量。",
    primaryCta: "个性化我的 5 公里计划",
    secondaryCta: "浏览全部计划",
    promise:
      "下方完整训练安排免费公开。当可训练日期、近期训练、配速或恢复情况让通用日历不再合适时，再进行个性化。",
    planChooser: {
      title: "选择适合你的 5 公里计划",
      subtitle:
        "按照你现在能完成的跑步能力选择起点。三种计划的起步要求和训练负荷不同。",
      options: [
        {
          label: "从零开始",
          title: "Couch to 5K",
          description: "如果连续轻松跑 20 分钟仍不舒服，先从跑走交替计划开始。",
          href: "/couch-to-5k-training-plan",
        },
        {
          label: "当前计划",
          title: "完成一次 5 公里",
          description:
            "如果你已经能轻松连续跑 20–30 分钟，并能每周安排四次跑步，选择这份 8 周计划。",
          href: null,
        },
        {
          label: "已有比赛基础",
          title: "提高 5 公里成绩",
          description:
            "如果已有近期 5 公里成绩，并希望系统加入间歇和节奏跑，选择进阶计划。",
          href: "/5k-training-plan/intermediate",
        },
      ],
    },
    trustItems: ["完整课表免费", "8 周", "每周 4 跑", "需连续跑 20–30 分钟"],
    forTitle: "这份 5 公里训练计划适合谁",
    forItems: [
      "你已经能轻松连续跑 20-30 分钟，不再需要跑走交替入门。",
      "你希望稳妥完成第一次 5 公里，或提升近期 5 公里成绩，而不是每次都跑到很累。",
      "你每周可以保留 4 个跑步日，包括一次质量课和一次较长轻松跑。",
      "你目前没有会改变跑姿的疼痛、疾病或伤病。",
    ],
    previewTitle: "8 周 5 公里计划如何推进",
    previewSubtitle:
      "计划从可重复的轻松跑逐步进入 5 公里专项训练，再在比赛前降低疲劳。下方提供完整逐日安排。",
    previewRows: [
      ["第 1-2 周", "建立节奏", "保持大部分训练轻松，加入放松加速跑或短上坡。"],
      [
        "第 3-6 周",
        "构建 5 公里能力",
        "交替进行可控间歇和节奏跑，长距离逐步增加。",
      ],
      [
        "第 7-8 周",
        "减量与比赛",
        "降低总量、保留少量速度，让身体清爽地进入比赛。",
      ],
    ],
    contentTitle: "一份实用 5 公里计划需要什么",
    contentSubtitle:
      "训练安排应把轻松跑量与质量课分开，让每次训练都有目的，并留下足够恢复来稳定重复。",
    contentSections: [
      [
        "轻松跑量",
        "轻松跑建立一致性，不把每一天都变成测试。",
        ["保持能对话的强度", "炎热和上坡时主动降速", "保留恢复日"],
      ],
      [
        "每周一次质量课",
        "间歇、上坡或节奏跑发展 5 公里专项速度，但不主导整周。",
        [
          "可控地完成重复跑",
          "动作开始变形前停止",
          "不要用强度补偿错过的轻松跑",
        ],
      ],
      [
        "长距离与减量",
        "适度长距离支持耐力；最后一周降低疲劳同时保留节奏。",
        ["长距离保持轻松", "比赛前降低总量", "避免临时测试体能"],
      ],
    ],
    conversionTitle: "把免费 5 公里安排放进你的日历",
    conversionText:
      "选择比赛日期、可训练日、当前配速和近期训练。Trainingload.ai 可以围绕这些限制生成草案，并让后续变化在进入日历前保持可审阅。",
    aiTitle: "Trainingload.ai 如何个性化 5 公里计划",
    aiSubtitle:
      "公开计划回答练什么；个性化决定训练放在哪一天、使用什么配速锚点，以及完成训练后该构建、维持还是恢复。",
    aiSignals: [
      ["计划与实际", "比较计划 workout 与真实完成情况，而不是只看配速。"],
      ["训练负荷", "增加跑量或加入更多强度前，先查看近期负荷和恢复。"],
      ["确认后调整", "智能教练生成调整草案；你或教练确认后才更新日历。"],
    ],
    relatedTitle: "继续选择跑步计划",
    relatedLinks: [
      [
        "从零开始？使用 Couch to 5K",
        "/couch-to-5k-training-plan",
        "如果连续轻松跑 20 分钟仍不舒适，先使用跑走交替计划。",
      ],
      [
        "从 5 公里进阶到 10 公里",
        "/10k-training-plan",
        "通过完整 10 公里计划延长耐力并发展阈值能力。",
      ],
      [
        "使用 VDOT 参考训练配速",
        "/vdot-calculator",
        "用近期表现作为可控训练配速的一个参考。",
      ],
    ],
    faq: [
      [
        "5 公里应该训练多久？",
        "本计划为 8 周。基础较少的跑者可能需要更久；已经稳定训练的跑者也应先核对负荷再决定是否从中段开始。",
      ],
      [
        "每周应该跑几天？",
        "计划使用每周 4 个跑步日。轻松日必须轻松，并在质量课之间保留休息或力量训练日。",
      ],
      [
        "这是新手 5 公里计划吗？",
        "是，但适合已经能轻松连续跑 20-30 分钟的新手。完全没有跑步基础的人应使用独立 Couch to 5K 计划。",
      ],
      [
        "错过训练怎么办？",
        "可以跳过，或只在仍能保护恢复时移动。不要连续堆叠两次质量课，也不要把漏掉的跑量塞进周末。",
      ],
      [
        "智能教练会自动改计划吗？",
        "Trainingload.ai 可以根据完成训练和负荷背景生成调整草案，但更新日历前仍需确认。",
      ],
    ],
  },
};

fiveKCopy["zh-hant"] = {
  ...fiveKCopy.zh,
  weeks: "8 週",
  level: "新手到進階",
  weeklyVolume: "每週 4 次跑步",
  metaTitle: "免費 8 週 5 公里訓練計畫：新手完賽安排",
  metaDescription:
    "給已能連續跑 20–30 分鐘的跑者：免費 8 週 5 公里訓練計畫，每週 4 跑，含輕鬆跑、受控穩定跑、長跑和賽前減量。",
  keywords: [
    "5 公里訓練計畫",
    "5k training plan",
    "5 公里跑步計畫",
    "5 公里訓練安排",
    "8 週 5 公里計畫",
  ],
  eyebrow: "8 週 5 公里跑步計畫",
  title: "免費 8 週 5 公里訓練計畫：面向新手完賽。",
  subtitle:
    "這份 5 公里計畫適合已經能輕鬆連續跑 20–30 分鐘、希望有明確備賽安排的跑者。計畫結合可對話強度的輕鬆跑、每週一次可控品質課、一次長距離、恢復和賽前短減量。",
  primaryCta: "個人化我的 5 公里計畫",
  secondaryCta: "瀏覽全部計畫",
  promise:
    "下方完整訓練安排免費公開。當可訓練日期、近期訓練、配速或恢復情況讓通用日曆不再合適時，再進行個人化。",
  planChooser: {
    title: "選擇適合你的 5 公里計畫",
    subtitle:
      "按照你現在能完成的跑步能力選擇起點。三種計畫的起步要求和訓練負荷不同。",
    options: [
      {
        label: "從零開始",
        title: "Couch to 5K",
        description: "如果連續輕鬆跑 20 分鐘仍不舒服，先從跑走交替計畫開始。",
        href: "/couch-to-5k-training-plan",
      },
      {
        label: "目前計畫",
        title: "完成一次 5 公里",
        description:
          "如果你已經能輕鬆連續跑 20–30 分鐘，並能每週安排四次跑步，選擇這份 8 週計畫。",
        href: null,
      },
      {
        label: "已有比賽基礎",
        title: "提高 5 公里成績",
        description:
          "如果已有近期 5 公里成績，並希望系統加入間歇和節奏跑，選擇進階計畫。",
        href: "/5k-training-plan/intermediate",
      },
    ],
  },
  trustItems: ["完整課表免費", "8 週", "每週 4 跑", "需連續跑 20–30 分鐘"],
  forTitle: "這份 5 公里訓練計畫適合誰",
  forItems: [
    "你已經能輕鬆連續跑 20–30 分鐘，不再需要跑走交替入門。",
    "你希望穩妥完成第一次 5 公里，或提升近期 5 公里成績，而不是每次都跑到很累。",
    "你每週可以保留 4 個跑步日，包括一次品質課和一次較長輕鬆跑。",
    "你目前沒有會改變跑姿的疼痛、疾病或傷病。",
  ],
  previewTitle: "8 週 5 公里計畫如何推進",
  previewSubtitle:
    "計畫從可重複的輕鬆跑逐步進入 5 公里專項訓練，再在比賽前降低疲勞。下方提供完整逐日安排。",
  previewRows: [
    ["第 1–2 週", "建立節奏", "保持大部分訓練輕鬆，加入放鬆加速跑或短上坡。"],
    [
      "第 3–6 週",
      "建立 5 公里能力",
      "交替進行可控間歇和節奏跑，長距離逐步增加。",
    ],
    [
      "第 7–8 週",
      "減量與比賽",
      "降低總量、保留少量速度，讓身體清爽地進入比賽。",
    ],
  ],
  contentTitle: "一份實用 5 公里計畫需要什麼",
  contentSubtitle:
    "訓練安排應把輕鬆跑量與品質課分開，讓每次訓練都有目的，並留下足夠恢復來穩定重複。",
  contentSections: [
    [
      "輕鬆跑量",
      "輕鬆跑建立一致性，不把每一天都變成測驗。",
      ["保持能對話的強度", "炎熱和上坡時主動降速", "保留恢復日"],
    ],
    [
      "每週一次品質課",
      "間歇、上坡或節奏跑發展 5 公里專項速度，但不主導整週。",
      ["可控地完成重複跑", "動作開始變形前停止", "不要用強度補償錯過的輕鬆跑"],
    ],
    [
      "長距離與減量",
      "適度長距離支援耐力；最後一週降低疲勞同時保留節奏。",
      ["長距離保持輕鬆", "比賽前降低總量", "避免臨時測試體能"],
    ],
  ],
  conversionTitle: "把免費 5 公里安排放進你的日曆",
  conversionText:
    "選擇比賽日期、可訓練日、目前配速和近期訓練。Trainingload.ai 可以依照這些限制產生草案，並讓後續變化在進入日曆前保持可審閱。",
  aiTitle: "Trainingload.ai 如何個人化 5 公里計畫",
  aiSubtitle:
    "公開計畫回答練什麼；個人化決定訓練放在哪一天、使用什麼配速基準，以及完成訓練後該建立、維持還是恢復。",
  aiSignals: [
    ["計畫與實際", "比較計畫訓練與真實完成情況，而不是只看配速。"],
    ["訓練負荷", "增加跑量或加入更多強度前，先查看近期負荷和恢復。"],
    ["確認後調整", "AI 產生調整草案；你或教練確認後才更新日曆。"],
  ],
  relatedTitle: "繼續選擇跑步計畫",
  relatedLinks: [
    [
      "從零開始？使用 Couch to 5K",
      "/couch-to-5k-training-plan",
      "如果連續輕鬆跑 20 分鐘仍不舒服，先使用跑走交替計畫。",
    ],
    [
      "從 5 公里進階到 10 公里",
      "/10k-training-plan",
      "透過完整 10 公里計畫延長耐力並發展閾值能力。",
    ],
    [
      "使用 VDOT 參考訓練配速",
      "/vdot-calculator",
      "用近期表現作為可控訓練配速的一個參考。",
    ],
  ],
  faq: [
    [
      "5 公里應該訓練多久？",
      "本計畫為 8 週。基礎較少的跑者可能需要更久；已經穩定訓練的跑者也應先核對負荷再決定是否從中段開始。",
    ],
    [
      "每週應該跑幾天？",
      "計畫使用每週 4 個跑步日。輕鬆日必須輕鬆，並在品質課之間保留休息或肌力訓練日。",
    ],
    [
      "這是新手 5 公里計畫嗎？",
      "是，但適合已經能輕鬆連續跑 20–30 分鐘的新手。完全沒有跑步基礎的人應使用獨立 Couch to 5K 計畫。",
    ],
    [
      "錯過訓練怎麼辦？",
      "可以跳過，或只在仍能保護恢復時移動。不要連續堆疊兩次品質課，也不要把漏掉的跑量塞進週末。",
    ],
    [
      "AI 會自動改計畫嗎？",
      "Trainingload.ai 可以根據完成訓練和負荷背景產生調整草案，但更新日曆前仍需確認。",
    ],
  ],
};

fiveKCopy.ja = {
  ...fiveKCopy.en,
  weeks: "8週間",
  level: "初心者〜中級者",
  weeklyVolume: "週4回",
  metaTitle: "無料8週間5Kトレーニングプラン：初心者向け",
  metaDescription:
    "20〜30分走れる人向けの無料8週間5Kプラン。週4回、イージー走、ステディ走、ロング走、短いテーパーを含みます。",
  keywords: [
    "5Kトレーニングプラン",
    "5k training plan",
    "5Kランニングプラン",
    "5K練習メニュー",
    "8週間5Kプラン",
  ],
  eyebrow: "8週間5Kランニングプラン",
  title: "初心者向け無料8週間5Kトレーニングプラン。",
  subtitle:
    "この5Kプランは、すでに20〜30分のイージーランを続けられ、明確なレーススケジュールを求めるランナー向けです。会話できるラン、週1回の質の高いセッション、ロングラン、回復、短いテーパーを組み合わせます。",
  primaryCta: "5Kプランを個別化",
  secondaryCta: "すべてのプランを見る",
  promise:
    "完全なスケジュールは以下で無料公開しています。走れる曜日、最近の練習、ペース、回復状態に汎用カレンダーが合わない場合は個別化してください。",
  planChooser: {
    title: "自分に合う5Kプランを選ぶ",
    subtitle:
      "今の走力に合う開始地点を選びます。3つのプランは開始条件とトレーニング負荷が異なります。",
    options: [
      {
        label: "ゼロから始める",
        title: "Couch to 5K",
        description:
          "20分の連続イージーランがまだ難しい場合は、ラン・ウォークから始めます。",
        href: "/couch-to-5k-training-plan",
      },
      {
        label: "現在のプラン",
        title: "5Kを完走する",
        description:
          "20〜30分のイージーランができ、週4回走れる場合は、この8週間プランを選びます。",
        href: null,
      },
      {
        label: "レース経験あり",
        title: "5Kを速く走る",
        description:
          "最近の5K記録があり、インターバルとテンポ走を取り入れたい場合は中級プランを選びます。",
        href: "/5k-training-plan/intermediate",
      },
    ],
  },
  trustItems: [
    "全スケジュール無料",
    "8週間",
    "週4回",
    "20〜30分の連続走が目安",
  ],
  forTitle: "この5Kプランが適している人",
  forItems: [
    "ラン・ウォークではなく、20〜30分のイージーランを続けられる。",
    "すべてのランを追い込まずに、初5K完走または最近の記録更新を目指したい。",
    "質のセッションと長めのイージーランを含む週4日のランを確保できる。",
    "走り方を変える痛み、病気、けがを現在抱えていない。",
  ],
  previewTitle: "8週間5Kプランの進み方",
  previewSubtitle:
    "繰り返せるイージーランから5K特有のトレーニングへ進み、レース前に疲労を減らします。完全な日別予定は以下にあります。",
  previewRows: [
    [
      "1〜2週",
      "リズムを作る",
      "大半をイージーに保ち、リラックスした流しや短い坂を加えます。",
    ],
    [
      "3〜6週",
      "5Kの力を伸ばす",
      "制御したインターバルとテンポを交互に行い、ロングランを少しずつ伸ばします。",
    ],
    [
      "7〜8週",
      "テーパーとレース",
      "走行量を減らし、少しだけスピードを保ってフレッシュに5Kへ臨みます。",
    ],
  ],
  contentTitle: "実用的な5Kプランに必要なこと",
  contentSubtitle:
    "イージーな走行量と質の高い練習を分け、各セッションに目的を持たせ、毎週繰り返せるだけの回復を残します。",
  contentSections: [
    [
      "イージーな走行量",
      "イージーランは毎日をテストにせず、継続性を作ります。",
      ["会話できる強度にする", "暑さや坂ではペースを落とす", "回復日を守る"],
    ],
    [
      "週1回の質の高い練習",
      "インターバル、坂、テンポで5K向けのスピードを伸ばしますが、週全体を支配させません。",
      [
        "余裕を残して反復する",
        "フォームが崩れる前に止める",
        "休んだイージーランを高強度で埋めない",
      ],
    ],
    [
      "ロングランとテーパー",
      "適度なロングランで持久力を支え、最終週はリズムを残しながら疲労を減らします。",
      [
        "ロングランはイージーに",
        "レース前に走行量を減らす",
        "直前の体力テストを避ける",
      ],
    ],
  ],
  conversionTitle: "無料の5Kスケジュールを自分のカレンダーへ",
  conversionText:
    "レース日、走れる曜日、現在のペース、最近の練習を選びます。Trainingload.aiは制約に合わせて下書きを作成し、その後の変更もカレンダーへ反映する前に確認できます。",
  aiTitle: "Trainingload.aiが5Kプランを個別化する方法",
  aiSubtitle:
    "公開スケジュールは何をするかを示します。個別化では曜日、ペースの基準、完了した練習から次に積み上げるか、維持するか、回復するかを決めます。",
  aiSignals: [
    [
      "計画と実績",
      "ペースだけで判断せず、予定した練習と実際に完了した内容を比較します。",
    ],
    [
      "トレーニング負荷",
      "走行量や高強度を増やす前に、最近の負荷と回復を確認します。",
    ],
    [
      "確認できる変更",
      "AIが変更案を作り、本人またはコーチが確認してからカレンダーを更新します。",
    ],
  ],
  relatedTitle: "次のランニングプラン",
  relatedLinks: [
    [
      "ゼロから始めるなら Couch to 5K",
      "/couch-to-5k-training-plan",
      "20分の連続イージーランが難しい場合はラン・ウォークから始めます。",
    ],
    [
      "5Kから10Kへ",
      "/10k-training-plan",
      "完全な10Kスケジュールで持久力と閾値能力を伸ばします。",
    ],
    [
      "VDOTでトレーニングペースを確認",
      "/vdot-calculator",
      "最近の記録を、制御されたトレーニングペースの参考にします。",
    ],
  ],
  faq: [
    [
      "5Kに向けて何週間トレーニングすべきですか？",
      "このスケジュールは8週間です。基礎体力が少ない場合は長めに取り、継続して走っている場合も負荷を確認してから途中参加を判断してください。",
    ],
    [
      "週に何日走りますか？",
      "週4日のランを使います。イージー日はイージーに保ち、質の高い練習の間に休養または筋力トレーニング日を残します。",
    ],
    [
      "初心者向けの5Kプランですか？",
      "はい。ただし20〜30分のイージーランを続けられる初心者向けです。まったく走っていない場合は別のCouch to 5Kプランを使ってください。",
    ],
    [
      "練習を休んだらどうしますか？",
      "そのまま飛ばすか、回復を守れる場合だけ移動します。質の高い練習を連続させたり、休んだ距離を週末に詰め込んだりしないでください。",
    ],
    [
      "AIがプランを自動変更しますか？",
      "Trainingload.aiは完了した練習と負荷から変更案を作れますが、カレンダーを更新する前に確認が必要です。",
    ],
  ],
};

const finishFiveKDetails: Record<
  "en" | "zh" | "zh-hant" | "ja",
  Pick<
    RunningPlan,
    | "previewTitle"
    | "previewSubtitle"
    | "previewRows"
    | "contentTitle"
    | "contentSubtitle"
    | "contentSections"
  >
> = {
  en: {
    previewTitle: "How the 8-week finish plan progresses",
    previewSubtitle:
      "Four repeatable runs each week develop continuous endurance, recover at the right moments, and taper into the final 5K.",
    previewRows: [
      [
        "Weeks 1–3",
        "Build the base",
        "Progress the long run from 25 to 35 minutes.",
      ],
      [
        "Week 4",
        "Absorb the work",
        "Reduce the long run and keep every session controlled.",
      ],
      [
        "Weeks 5–6",
        "Build again",
        "Reach a 40- then 45-minute conversational long run.",
      ],
      [
        "Weeks 7–8",
        "Taper and finish",
        "Reduce fatigue, then complete 5K with a controlled start.",
      ],
    ],
    contentTitle: "What each weekly run is for",
    contentSubtitle:
      "The schedule separates easy volume, controlled steady running, and the long run so no single session has to do everything.",
    contentSections: [
      [
        "Two easy runs",
        "Easy and recovery running builds consistency while preserving energy.",
        [
          "Stay conversational",
          "Slow down for heat and hills",
          "Do not stack missed sessions",
        ],
      ],
      [
        "One steady run",
        "A controlled RPE 5 effort develops rhythm without becoming a race.",
        [
          "Keep the effort repeatable",
          "Finish with good form",
          "Use RPE when pace evidence is weak",
        ],
      ],
      [
        "One long run",
        "The long run grows in two blocks with recovery and taper weeks between them.",
        [
          "Keep breathing conversational",
          "Reduce in weeks 4 and 7",
          "Control the opening of the final 5K",
        ],
      ],
    ],
  },
  zh: {
    previewTitle: "8 周完赛计划如何进阶",
    previewSubtitle:
      "每周四次可重复训练逐步建立连续跑耐力，在正确时间恢复，并减量进入最终 5K。",
    previewRows: [
      ["第 1–3 周", "建立基础", "长跑从 25 分钟逐步增加到 35 分钟。"],
      ["第 4 周", "吸收训练", "降低长跑时长，所有训练保持受控。"],
      ["第 5–6 周", "再次构建", "依次完成 40 和 45 分钟可对话长跑。"],
      ["第 7–8 周", "减量与完赛", "先降低疲劳，再控制开局完成 5K。"],
    ],
    contentTitle: "每周四次跑步分别解决什么",
    contentSubtitle:
      "计划把轻松跑量、受控稳定跑和长跑分开，让每次训练只承担清晰目的。",
    contentSections: [
      [
        "两次轻松跑",
        "轻松跑和恢复跑在积累连续性的同时保留精力。",
        ["保持可对话", "炎热和坡路主动降速", "不要堆叠错过的训练"],
      ],
      [
        "一次稳定跑",
        "受控的 RPE 5 训练改善节奏感，但不把训练跑成比赛。",
        ["强度应可重复", "保持良好跑姿结束", "配速证据不足时使用 RPE"],
      ],
      [
        "一次长跑",
        "长跑分两轮递增，中间安排恢复周，最后安排减量。",
        ["保持可对话呼吸", "第 4 和第 7 周降低负荷", "最终 5K 主动控制开局"],
      ],
    ],
  },
  "zh-hant": {
    previewTitle: "8 週完賽計畫如何進階",
    previewSubtitle:
      "每週四次可重複訓練逐步建立連續跑耐力，在正確時間恢復，並減量進入最終 5K。",
    previewRows: [
      ["第 1–3 週", "建立基礎", "長跑從 25 分鐘逐步增加到 35 分鐘。"],
      ["第 4 週", "吸收訓練", "降低長跑時長，所有訓練保持受控。"],
      ["第 5–6 週", "再次構建", "依次完成 40 和 45 分鐘可對話長跑。"],
      ["第 7–8 週", "減量與完賽", "先降低疲勞，再控制開局完成 5K。"],
    ],
    contentTitle: "每週四次跑步分別解決什麼",
    contentSubtitle:
      "計畫把輕鬆跑量、受控穩定跑和長跑分開，讓每次訓練只承擔清晰目的。",
    contentSections: [
      [
        "兩次輕鬆跑",
        "輕鬆跑和恢復跑在累積連續性的同時保留精力。",
        ["保持可對話", "炎熱和坡路主動降速", "不要堆疊錯過的訓練"],
      ],
      [
        "一次穩定跑",
        "受控的 RPE 5 訓練改善節奏感，但不把訓練跑成比賽。",
        ["強度應可重複", "保持良好跑姿結束", "配速證據不足時使用 RPE"],
      ],
      [
        "一次長跑",
        "長跑分兩輪遞增，中間安排恢復週，最後安排減量。",
        ["保持可對話呼吸", "第 4 和第 7 週降低負荷", "最終 5K 主動控制開局"],
      ],
    ],
  },
  ja: {
    previewTitle: "8週間の完走プランの進み方",
    previewSubtitle:
      "週4回の再現できる練習で連続走の持久力を伸ばし、適切に回復しながら最後の5Kへテーパーします。",
    previewRows: [
      ["1〜3週目", "土台作り", "ロング走を25分から35分へ伸ばします。"],
      ["4週目", "適応", "ロング走を短くし、すべての練習をコントロールします。"],
      ["5〜6週目", "再構築", "会話できる40分、45分のロング走へ進みます。"],
      [
        "7〜8週目",
        "テーパーと完走",
        "疲労を減らし、序盤を抑えて5Kを完走します。",
      ],
    ],
    contentTitle: "週4回の各ランの目的",
    contentSubtitle:
      "イージー走、ステディ走、ロング走の役割を分け、各練習の目的を明確にします。",
    contentSections: [
      [
        "2回のイージー走",
        "継続性を積みながら回復の余力を守ります。",
        ["会話できる強度", "暑さや坂では落とす", "欠けた練習を詰め込まない"],
      ],
      [
        "1回のステディ走",
        "RPE 5のコントロールした走りで、レースにせずリズムを磨きます。",
        ["再現できる強度", "良いフォームで終える", "根拠が弱ければRPEを使う"],
      ],
      [
        "1回のロング走",
        "2つの構築ブロックの間に回復週を置き、最後にテーパーします。",
        ["会話できる呼吸", "4・7週目に負荷を下げる", "最後の5Kは序盤を抑える"],
      ],
    ],
  },
};

export function createFiveKTrainingPlan(
  basePlan: RunningPlan,
  lang = "en",
): RunningPlan {
  const copy = fiveKCopy[lang] ?? fiveKCopy.en;
  const templateLocale = normalizePlanTemplateLocale(lang);
  const locale = planCopyLocale(lang);
  const localized = getRunPlanTemplate("finish-5k")!.copy[templateLocale];
  const details = finishFiveKDetails[templateLocale];
  const templateMetaDescriptions: Record<string, string> = {
    en: "Free 8-week 5K training plan for runners who can already run 20–30 minutes. Four runs a week, easy volume, one steady session, and a short taper.",
    zh: "给已能连续跑 20–30 分钟的跑者：免费 8 周 5 公里训练计划，每周 4 跑，含轻松跑、受控稳定跑、长跑和赛前减量。",
    "zh-hant":
      "給已能連續跑 20–30 分鐘的跑者：免費 8 週 5 公里訓練計畫，每週 4 跑，含輕鬆跑、受控穩定跑、長跑和賽前減量。",
    ja: "20〜30分走れる人向けの無料8週間5Kプラン。週4回、イージー走、ステディ走、ロング走、短いテーパーを含みます。",
  };
  const existingRelatedLinks = copy.relatedLinks ?? basePlan.relatedLinks ?? [];
  const [firstRelated, ...restRelated] = existingRelatedLinks;
  const intermediateLink: [string, string, string] =
    locale === "zh-hant"
      ? [
          "進階 5K 訓練計畫",
          "/5k-training-plan/intermediate",
          "已有近期 5K 成績時，加入更明確的間歇和節奏訓練。",
        ]
      : locale === "zh"
        ? [
            "进阶 5K 训练计划",
            "/5k-training-plan/intermediate",
            "已有近期 5K 成绩时，加入更明确的间歇和节奏训练。",
          ]
        : locale === "ja"
          ? [
              "中級者向け5Kトレーニングプラン",
              "/5k-training-plan/intermediate",
              "最近の5K記録があるなら、インターバルとテンポ走を加えます。",
            ]
          : [
              "Intermediate 5K training plan",
              "/5k-training-plan/intermediate",
              "Use intervals and tempo work when you have a recent 5K anchor.",
            ];
  return {
    ...basePlan,
    ...copy,
    slug: "5k-training-plan",
    routePath: "/5k-training-plan",
    templateSlug: "finish-5k",
    title: copy.title ?? basePlan.title,
    subtitle: copy.subtitle ?? localized.description,
    promise: copy.promise ?? localized.promise,
    ...details,
    metaDescription:
      templateMetaDescriptions[templateLocale] ?? templateMetaDescriptions.en,
    relatedLinks: mergeRelatedLinks(
      [
        ...(firstRelated ? [firstRelated] : []),
        intermediateLink,
        ...restRelated,
      ],
      productLoopRelatedLinks(lang),
    ),
  };
}

export function createIntermediateFiveKPlan(
  basePlan: RunningPlan,
  lang = "en",
): RunningPlan {
  const finish = createFiveKTrainingPlan(basePlan, lang);
  const sourceCopy = fiveKCopy[lang] ?? fiveKCopy.en;
  const localized =
    getRunPlanTemplate("improve-5k")!.copy[normalizePlanTemplateLocale(lang)];
  const zh = lang.startsWith("zh");
  const hant = lang === "zh-hant";
  const ja = lang === "ja";
  const heroSubtitle = hant
    ? "每週用兩次輕鬆有氧跑、一次受控品質課和一次長跑提升 5K 表現。單數週安排可重複間歇，雙數週安排受控節奏跑，並用輕鬆日隔開品質課和長跑。第 4 週降低負荷，第 5–6 週重新構建，第 7 週減量，第 8 週完成 5K。"
    : zh
      ? "每周用两次轻松有氧跑、一次受控质量课和一次长跑提升 5K 表现。单数周安排可重复间歇，双数周安排受控节奏跑，并用轻松日隔开质量课和长跑。第 4 周降低负荷，第 5–6 周重新构建，第 7 周减量，第 8 周完成 5K。"
      : ja
        ? "週2回のイージー有酸素走、1回のコントロールした質の高い練習、1回のロング走で5Kの走力を伸ばします。奇数週は再現できるインターバル、偶数週はコントロールしたテンポ走を行い、質の高い練習とロング走の間にはイージー日を置きます。4週目に負荷を下げ、5〜6週目に再構築、7週目にテーパーし、8週目に5Kを走ります。"
        : "Build a stronger 5K with two easy aerobic runs, one controlled quality session and one long run each week. Odd weeks use repeatable intervals and even weeks use controlled tempo running, with an easy day separating quality from the long run. Week 4 reduces load, weeks 5–6 rebuild, week 7 tapers and week 8 ends with a 5K effort.";
  const previewRows: RunningPlan["previewRows"] = zh
    ? hant
      ? [
          [
            "第 1–3 週",
            "建立專項能力",
            "間歇與節奏跑交替，長跑增加至 50 分鐘。",
          ],
          ["第 4 週", "恢復", "縮短品質課和長跑，吸收前三週負荷。"],
          [
            "第 5–6 週",
            "重新構建",
            "間歇增加至 6×2 分鐘，節奏跑增加至 20 分鐘。",
          ],
          ["第 7–8 週", "減量與 5K", "保留短品質刺激，降低總量後完成 5K。"],
        ]
      : [
          [
            "第 1–3 周",
            "建立专项能力",
            "间歇与节奏跑交替，长跑增加至 50 分钟。",
          ],
          ["第 4 周", "恢复", "缩短质量课和长跑，吸收前三周负荷。"],
          [
            "第 5–6 周",
            "重新构建",
            "间歇增加至 6×2 分钟，节奏跑增加至 20 分钟。",
          ],
          ["第 7–8 周", "减量与 5K", "保留短质量刺激，降低总量后完成 5K。"],
        ]
    : ja
      ? [
          [
            "1〜3週目",
            "5K能力を構築",
            "インターバルとテンポを交互に行い、ロング走を50分まで伸ばします。",
          ],
          [
            "4週目",
            "回復",
            "質の高い練習とロング走を短くし、負荷に適応します。",
          ],
          ["5〜6週目", "再構築", "6×2分インターバルと20分テンポ走へ進みます。"],
          [
            "7〜8週目",
            "テーパーと5K",
            "短い刺激を残し、総量を下げて5Kを走ります。",
          ],
        ]
      : [
          [
            "Weeks 1–3",
            "Build 5K capacity",
            "Alternate intervals and tempo while the long run reaches 50 minutes.",
          ],
          [
            "Week 4",
            "Recover",
            "Shorten the quality session and long run to absorb the first block.",
          ],
          [
            "Weeks 5–6",
            "Build again",
            "Progress to 6×2-minute intervals and a 20-minute tempo.",
          ],
          [
            "Weeks 7–8",
            "Taper and run 5K",
            "Keep a short quality touch, reduce volume, then complete the 5K.",
          ],
        ];
  const intermediateMethod: Pick<
    RunningPlan,
    "contentTitle" | "contentSubtitle" | "contentSections"
  > = hant
    ? {
        contentTitle: "進階 5K 如何把速度練成可重複的能力",
        contentSubtitle:
          "每週只安排一堂主要品質課，其他跑量用來吸收刺激，避免把每次訓練都跑成測驗。",
        contentSections: [
          [
            "輕鬆跑保護品質課",
            "大部分跑量保持可對話強度，讓你能在關鍵訓練中完成正確的節奏與動作。",
            ["不追逐輕鬆跑配速", "品質課之間保留恢復", "疲勞上升時先減量"],
          ],
          [
            "間歇讓 5K 配速可重複",
            "用短組數累積接近 5K 強度的時間，不把任何一組做成衝刺。",
            ["以近期成績或 RPE 定強度", "每組保持一致", "動作走樣就停止增加"],
          ],
          [
            "節奏跑與長跑建立耐力",
            "節奏跑提高可持續強度，長跑延長有氧時間，兩者共同支撐比賽後半段。",
            ["節奏跑保持受控", "長跑維持輕鬆", "第 4、7–8 週主動減量"],
          ],
        ],
      }
    : zh
      ? {
          contentTitle: "进阶 5K 如何把速度练成可重复的能力",
          contentSubtitle:
            "每周只安排一堂主要质量课，其他跑量用来吸收刺激，避免把每次训练都跑成测试。",
          contentSections: [
            [
              "轻松跑保护质量课",
              "大部分跑量保持可对话强度，让你能在关键训练中完成正确的节奏与动作。",
              ["不追逐轻松跑配速", "质量课之间保留恢复", "疲劳上升时先减量"],
            ],
            [
              "间歇让 5K 配速可重复",
              "用短组数累积接近 5K 强度的时间，不把任何一组做成冲刺。",
              ["以近期成绩或 RPE 定强度", "每组保持一致", "动作走样就停止增加"],
            ],
            [
              "节奏跑与长跑建立耐力",
              "节奏跑提高可持续强度，长跑延长有氧时间，两者共同支撑比赛后半段。",
              ["节奏跑保持受控", "长跑维持轻松", "第 4、7–8 周主动减量"],
            ],
          ],
        }
      : ja
        ? {
            contentTitle: "中級5Kでスピードを再現できる力に変える方法",
            contentSubtitle:
              "主な質練習は週1回だけにし、ほかの走行で刺激を吸収します。毎回をタイムトライアルにはしません。",
            contentSections: [
              [
                "イージーランで質練習を守る",
                "大半を会話できる強度に保ち、重要な練習で正しいリズムとフォームを再現します。",
                [
                  "楽な日のペースを追わない",
                  "質練習の間に回復を入れる",
                  "疲労が増えたら先に量を減らす",
                ],
              ],
              [
                "インターバルで5Kペースを反復する",
                "短い反復で5Kに近い強度の時間を積み、どの反復も全力疾走にはしません。",
                [
                  "最近の記録かRPEで設定",
                  "各反復をそろえる",
                  "フォームが崩れたら追加しない",
                ],
              ],
              [
                "テンポとロング走で持久力を作る",
                "テンポ走で持続可能な強度を高め、ロング走で有酸素時間を延ばします。",
                [
                  "テンポはコントロール",
                  "ロング走は楽に",
                  "4週目と7〜8週目は減量",
                ],
              ],
            ],
          }
        : {
            contentTitle:
              "How this intermediate 5K plan makes speed repeatable",
            contentSubtitle:
              "There is one main quality session each week. The rest of the running absorbs that work instead of turning every day into a test.",
            contentSections: [
              [
                "Easy running protects the quality session",
                "Keep most mileage conversational so the key workout gets the rhythm and form it needs.",
                [
                  "Do not chase easy-day pace",
                  "Recover between quality days",
                  "Reduce volume first when fatigue rises",
                ],
              ],
              [
                "Intervals make 5K pace repeatable",
                "Short repetitions accumulate time near 5K effort without turning any repeat into a sprint.",
                [
                  "Use a recent result or RPE",
                  "Keep repetitions even",
                  "Stop adding work when form fades",
                ],
              ],
              [
                "Tempo and long runs build durability",
                "Tempo raises sustainable effort while the long run extends aerobic time for the second half of a 5K.",
                [
                  "Keep tempo controlled",
                  "Keep the long run easy",
                  "Deload in weeks 4 and 7–8",
                ],
              ],
            ],
          };
  return {
    ...finish,
    slug: "5k-training-plan-intermediate",
    routePath: "/5k-training-plan/intermediate",
    templateSlug: "improve-5k",
    level: hant ? "進階" : zh ? "进阶" : ja ? "中級" : "Intermediate",
    metaTitle: zh
      ? hant
        ? "進階 5 公里訓練計畫：免費 8 週提速安排"
        : "进阶 5 公里训练计划：免费 8 周提速安排"
      : ja
        ? "中級者向け5Kトレーニングプラン：無料8週間"
        : "Intermediate 5K Training Plan: Free 8-Week Schedule",
    metaDescription: zh
      ? hant
        ? "給已能穩定每週跑 4 天的跑者：免費 8 週進階 5K 計畫，含間歇、節奏跑、長跑和減量。有成績用 VDOT，沒有則用 RPE。"
        : "给已能稳定每周跑 4 天的跑者：免费 8 周进阶 5K 计划，含间歇、节奏跑、长跑和减量。有成绩用 VDOT，没有则用 RPE。"
      : ja
        ? "週4日走れる中級者向けの無料8週間5Kプラン。インターバル、テンポ、ロング走、テーパーを含み、記録がなければRPEを使います。"
        : "Free 8-week intermediate 5K plan for runners who already train four days a week. Intervals, tempo, long runs, and taper, with VDOT or RPE.",
    keywords: zh
      ? [
          hant ? "進階 5K 訓練計畫" : "进阶 5K 训练计划",
          "5k training plan intermediate",
          hant ? "5 公里提速計畫" : "5 公里提速计划",
          "VDOT 5K",
        ]
      : ja
        ? [
            "中級者 5K トレーニングプラン",
            "5K インターバル",
            "5K テンポ走",
            "VDOT 5K",
          ]
        : [
            "intermediate 5k training plan",
            "5k training plan intermediate",
            "8 week 5k improvement plan",
            "5k interval training",
            "5k tempo plan",
            "faster 5k training plan",
            "5k training plan sub 25",
          ],
    eyebrow: hant
      ? "8 週進階 5 公里計畫"
      : zh
        ? "8 周进阶 5 公里计划"
        : ja
          ? "8週間中級5Kプラン"
          : "8-week intermediate 5K plan",
    title: localized.title,
    subtitle: heroSubtitle,
    promise: localized.promise,
    previewTitle: sourceCopy.previewTitle ?? finish.previewTitle,
    previewSubtitle: sourceCopy.previewSubtitle ?? finish.previewSubtitle,
    previewRows,
    planChooser: createFiveKPlanChooser(lang, "intermediate"),
    ...intermediateMethod,
    forTitle: hant
      ? "這份進階 5K 計畫適合誰"
      : zh
        ? "这份进阶 5K 计划适合谁"
        : ja
          ? "この中級5Kプランの対象"
          : "Who this intermediate 5K plan is for",
    forItems: hant
      ? [
          "你能穩定完成每週 4 次跑步。",
          "你有近期 5K 成績或足夠訓練基線。",
          "你能在品質課之間保留恢復日。",
          "你目前沒有影響跑姿的疼痛或傷病。",
        ]
      : zh
        ? [
            "你能稳定完成每周 4 次跑步。",
            "你有近期 5K 成绩或足够训练基线。",
            "你能在质量课之间保留恢复日。",
            "你目前没有影响跑姿的疼痛或伤病。",
          ]
        : ja
          ? [
              "週4日安定して走れます。",
              "最近の5K記録、または十分な走力の土台があります。",
              "質の高い練習の間に回復日を残せます。",
              "走姿が変わる痛みやケガはありません。",
            ]
          : [
              "You can consistently run four days per week.",
              "You have a recent 5K result or an adequate training base.",
              "You can protect recovery between quality sessions.",
              "You are not currently managing pain or injury that changes your gait.",
            ],
    relatedLinks: mergeRelatedLinks(
      [
        [
          hant
            ? "先使用標準 5K 完賽計畫"
            : zh
              ? "先使用标准 5K 完赛计划"
              : ja
                ? "先に標準の5K完走プランを使う"
                : "Use the standard finish plan first",
          "/5k-training-plan",
          hant
            ? "如果尚未穩定訓練 4 天，先建立可重複的基礎。"
            : zh
              ? "如果尚未稳定训练 4 天，先建立可重复的基础。"
              : ja
                ? "週4日がまだ安定しないなら、先に再現できる土台を作ります。"
                : "Build a repeatable base first if four training days are not yet sustainable.",
        ],
      ],
      productLoopRelatedLinks(lang),
    ),
    faq: hant
      ? [
          [
            "這是進階 5 公里訓練計畫嗎？",
            "是。給已經能穩定每週跑 4 天、想用間歇和節奏跑提高 5K 的人，不是第一次完賽課表。",
          ],
          [
            "和免費新手 5K 計畫有何不同？",
            "新手頁從連續跑 20–30 分鐘開始完賽。這頁在基礎穩定後加入更明確的品質課。還不能穩定跑 4 天時，先用 5K 完賽計畫。",
          ],
          [
            "每週有幾次品質課？",
            "一次主要品質課，再加輕鬆跑量和長跑。不要連續兩天高強度。",
          ],
          [
            "這份計畫能幫我跑進 25 分鐘嗎？",
            "如果你目前成績已接近 25 分鐘，它可以作為提速框架；請用近期 5K 成績設定強度。若差距較大，先完成一輪並重新測試，不要直接套用過快配速。",
          ],
          [
            "AI 會自動改這份進階計畫嗎？",
            "Trainingload.ai 可以根據完成訓練和訓練負荷產生調整草案，但日曆只有在你確認後才會更新。",
          ],
        ]
      : zh
        ? [
            [
              "这是进阶 5 公里训练计划吗？",
              "是。给已经能稳定每周跑 4 天、想用间歇和节奏跑提高 5K 的人，不是第一次完赛课表。",
            ],
            [
              "和免费新手 5K 计划有什么不同？",
              "新手页从连续跑 20–30 分钟开始完赛。这页在基础稳定后加入更明确的质量课。还不能稳定跑 4 天时，先用 5K 完赛计划。",
            ],
            [
              "每周有几次质量课？",
              "一次主要质量课，再加轻松跑量和长跑。不要连续两天高强度。",
            ],
            [
              "这份计划能帮我跑进 25 分钟吗？",
              "如果你目前成绩已接近 25 分钟，它可以作为提速框架；请用近期 5K 成绩设置强度。若差距较大，先完成一轮并重新测试，不要直接套用过快配速。",
            ],
            [
              "智能教练会自动改这份进阶计划吗？",
              "Trainingload.ai 可以根据完成训练和训练负荷生成调整草案，但日历只有在你确认后才会更新。",
            ],
          ]
        : ja
          ? [
              [
                "中級者向けの5Kプランですか？",
                "はい。すでに週4日走れて、インターバルとテンポで5Kを速くしたい人向けです。初完走用ではありません。",
              ],
              [
                "初心者向け5Kプランとの違いは？",
                "初心者ページは20〜30分走れる人の完走用です。このページは土台が安定した後に質の高い練習を加えます。週4日がまだ難しい場合は、先に5K完走プランを使ってください。",
              ],
              [
                "週に質の高い練習は何回ですか？",
                "メインの質練習は1回で、イージー走とロング走を組み合わせます。高強度を2日連続させないでください。",
              ],
              [
                "このプランで25分切りを狙えますか？",
                "現在の記録が25分に近ければ、スピード向上の枠組みとして使えます。最近の5K記録で強度を設定してください。差が大きい場合は、まず1サイクル終えて再テストします。",
              ],
              [
                "AIがこの中級プランを自動変更しますか？",
                "Trainingload.aiは完了した練習とトレーニング負荷から変更案を作れますが、カレンダーは確認後にだけ更新されます。",
              ],
            ]
          : [
              [
                "Is this an intermediate 5K training plan?",
                "Yes. It is for runners who already train four days a week and want faster 5K work with intervals and tempo, not a first-finish schedule.",
              ],
              [
                "How is this different from the beginner 5K plan?",
                "The beginner hub finishes a first 5K from a 20–30 minute base. This page adds clearer quality work after that base is stable. Use the finish plan first if four running days are not yet repeatable.",
              ],
              [
                "How many quality sessions are in the week?",
                "One main quality session plus easy volume and a long run. Do not stack two hard days.",
              ],
              [
                "Can this plan help me run a sub-25 5K?",
                "It can be a useful faster-5K framework if your current result is already close to 25 minutes. Set intensity from a recent 5K. If the gap is larger, complete a cycle and retest instead of forcing sub-25 pace.",
              ],
              [
                "Can AI change this intermediate plan automatically?",
                "Trainingload.ai can draft adjustments from completed runs and training load, but the calendar updates only after you confirm.",
              ],
            ],
  };
}

export function createHalfMarathonTrainingPlan(
  basePlan: RunningPlan,
  lang = "en",
): RunningPlan {
  return {
    ...basePlan,
    slug: "half-marathon-training-plan",
    routePath: "/half-marathon-training-plan",
    templateSlug: "finish-half-marathon",
    planChooser: createRaceDistancePlanChooser(lang, "half-marathon"),
    howToTotalTime: isHalfMarathonIndexedLocale(lang)
      ? HALF_MARATHON_PLAN_FACTS.howToTotalTime
      : basePlan.howToTotalTime,
    relatedLinks: mergeRelatedLinks(
      basePlan.relatedLinks,
      productLoopRelatedLinks(lang),
    ),
  };
}

export function createMarathonTrainingPlan(
  basePlan: RunningPlan,
  lang = "en",
): RunningPlan {
  return {
    ...basePlan,
    slug: "marathon-training-plan",
    routePath: "/marathon-training-plan",
    templateSlug: "finish-marathon",
    planChooser: createRaceDistancePlanChooser(lang, "marathon"),
    howToTotalTime: isMarathonIndexedLocale(lang)
      ? MARATHON_PLAN_FACTS.howToTotalTime
      : basePlan.howToTotalTime,
    relatedLinks: mergeRelatedLinks(
      basePlan.relatedLinks,
      productLoopRelatedLinks(lang),
    ),
  };
}

export function createTenKTrainingPlan(
  basePlan: RunningPlan,
  lang = "en",
): RunningPlan {
  return {
    ...basePlan,
    slug: "10k-training-plan",
    routePath: "/10k-training-plan",
    templateSlug: "finish-10k",
    planChooser: createRaceDistancePlanChooser(lang, "10k"),
    howToTotalTime: isTenKIndexedLocale(lang)
      ? TEN_K_PLAN_FACTS.howToTotalTime
      : basePlan.howToTotalTime,
    relatedLinks: mergeRelatedLinks(
      basePlan.relatedLinks,
      productLoopRelatedLinks(lang),
    ),
  };
}

export function createDistanceTrainingPlan(
  basePlan: RunningPlan,
  lang = "en",
): RunningPlan {
  if (basePlan.slug === "5k-training-plan") {
    return createFiveKTrainingPlan(basePlan, lang);
  }
  if (basePlan.slug === "10k-training-plan") {
    return createTenKTrainingPlan(basePlan, lang);
  }
  if (basePlan.slug === "half-marathon-training-plan") {
    return createHalfMarathonTrainingPlan(basePlan, lang);
  }
  if (basePlan.slug === "marathon-training-plan") {
    return createMarathonTrainingPlan(basePlan, lang);
  }
  return {
    ...basePlan,
    relatedLinks: mergeRelatedLinks(
      basePlan.relatedLinks,
      productLoopRelatedLinks(lang),
    ),
    routePath: `/${basePlan.slug}`,
  };
}

export type RunningPlanPageLabels = {
  home: string;
  plans: string;
  runningPlan: string;
  timeline: string;
  level: string;
  volume: string;
  faqTitleSuffix: string;
  faqSubtitle: string;
  finalTitle: string;
  finalText: string;
  viewFullSchedule: string;
  addToCalendar: string;
};

export type PlanCollectionCopy = {
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  eyebrow: string;
  title: string;
  subtitle: string;
  primary: string;
  secondary: string;
  groupTitle: string;
  groupSubtitle: string;
  cardPrimary: string;
  cardSecondary: string;
  differenceTitle: string;
  differences: Array<[string, string]>;
  trustItems?: string[];
  faqTitle?: string;
  faqSubtitle?: string;
  faq?: Array<[string, string]>;
};
