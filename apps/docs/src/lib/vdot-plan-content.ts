import messages from "@trainingloadai/messages/docs-copy/daniels-running-formula.json";
import { localePrefix } from "@/lib/locale-url";

export const VDOT_CONTENT_LOCALES = [
  "en",
  "zh",
  "zh-hant",
  "ja",
  "ko",
  "de",
  "fr",
  "es",
  "it",
  "pt-BR",
] as const;

export type VdotContentLocale = (typeof VDOT_CONTENT_LOCALES)[number];

function isVdotContentLocale(
  locale: string,
): locale is VdotContentLocale {
  return (VDOT_CONTENT_LOCALES as readonly string[]).includes(locale);
}

function family(locale: string): VdotContentLocale {
  if (isVdotContentLocale(locale)) return locale;
  if (locale.startsWith("zh")) return "zh";
  return "en";
}

const guide: Record<VdotContentLocale, typeof messages.en> = messages;

export function getDanielsGuideCopy(locale: string) {
  return guide[family(locale)];
}

const generator = {
  en: {
    metadataTitle:
      "VDOT Training Plan Generator: 5K to Marathon | Trainingload.ai",
    metadataDescription:
      "Enter current VDOT, goal distance, and training schedule to generate printable E/M/T/I/R workouts and import the plan into Trainingload.ai.",
    eyebrow: "Free deterministic planning tool",
    title: "Enter VDOT. Get a running plan you can execute.",
    subtitle:
      "Choose 5K, 10K, half marathon, or marathon. Your current VDOT sets intensity; current volume and available days set how much training the plan prescribes.",
    vdotOnlyNote:
      "No activity upload is required. If you do not know your VDOT, calculate it first from a representative race result.",
    labels: {
      vdot: "Current VDOT",
      goal: "Goal distance",
      weeks: "Plan length",
      weeklyDistance: "Average weekly distance (last 4 weeks)",
      longestRun: "Longest run in the last 4 weeks (optional)",
      runsPerWeek: "Runs per week",
      longRunDay: "Long-run day",
      startDate: "Start date",
      unit: "Distance unit",
      unavailable: "Unavailable days",
      goalTime: "Goal time (optional)",
    },
    actions: {
      generate: "Generate my plan",
      regenerate: "Regenerate plan",
      calculate: "Calculate VDOT first",
      print: "Print / Save PDF",
      json: "Download JSON",
      import: "Import to Trainingload.ai",
      backToGuide: "Read the method guide",
    },
    units: { metric: "Kilometres", imperial: "Miles" },
    goals: {
      "5K": "5K",
      "10K": "10K",
      HALF_MARATHON: "Half marathon",
      MARATHON: "Marathon",
    },
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    result: {
      title: "Your VDOT training plan",
      summary: "Plan summary",
      paces: "Training paces",
      phases: "Training phases",
      schedule: "Week-by-week schedule",
      week: "Week",
      total: "training",
      race: "race",
      workouts: "workouts",
      showWorkout: "Show workout steps",
      hideWorkout: "Hide workout steps",
      generated: "Generated",
      warning: "Plan note",
      disclaimer:
        "This plan references VDOT and E/M/T/I/R concepts but is not an official Jack Daniels or VDOT O2 plan.",
    },
    zones: {
      E: ["E · Easy", "Aerobic development and recovery"],
      M: ["M · Marathon", "Steady race-specific rhythm"],
      T: ["T · Threshold", "Sustainable speed"],
      I: ["I · Interval", "Maximal aerobic power"],
      R: ["R · Repetition", "Economy and relaxed speed"],
    },
    messages: {
      inputError: "Check the highlighted inputs and try again.",
      vdotError: "VDOT must be between 20 and 85.",
      periodError: "Choose a plan length available for this goal distance.",
      startDateError: "Choose a valid start date.",
      weeklyDistanceError:
        "Average weekly distance must be between 8 and 250 km.",
      weeklyDistanceErrorImperial:
        "Average weekly distance must be between 5 and 155 mi.",
      longestRunError: "Longest run must be between 1 and 80 km.",
      longestRunErrorImperial: "Longest run must be between 1 and 50 mi.",
      runDaysError: "Runs per week must be between 3 and 7.",
      unavailableDaysError:
        "There are not enough available days for the selected run frequency.",
      longRunDayError: "The long-run day cannot also be an unavailable day.",
      goalTimeError: "Enter goal time as HH:MM:SS or MM:SS.",
      marathonFoundationError:
        "This marathon timeline is too short for the supplied recent volume and longest run. Choose at least 18 weeks or build more foundation first.",
      generated: "Plan generated from your current VDOT.",
      importError: "Could not prepare the import. Try again.",
      noResult: "Complete the fields above to create your plan.",
      volumeExplanation:
        "VDOT determines pace, not volume. Use your average from the last four weeks because runners with the same VDOT can tolerate very different workloads.",
    },
    howTitle: "How the generator works",
    howSteps: [
      ["1. Anchor intensity", "VDOT resolves E/M/T/I/R pace ranges."],
      [
        "2. Build the cycle",
        "Goal, weeks, current volume, and available days shape phases and load.",
      ],
      [
        "3. Validate every week",
        "The engine checks recovery spacing, quality-day limits, and workout structure.",
      ],
      [
        "4. Print or import",
        "Keep a paper/PDF copy or confirm a structured draft inside Trainingload.ai.",
      ],
    ],
    faqTitle: "Generator questions",
    faq: [
      [
        "Does the goal time change my workout paces?",
        "No. It is informational. Workout paces remain anchored to current VDOT.",
      ],
      [
        "Why do you ask for weekly distance?",
        "VDOT describes intensity. Current distance helps prevent the plan from prescribing a workload far beyond recent training.",
      ],
      [
        "Will importing activate the plan?",
        "No. Import creates a draft that you review before activation.",
      ],
    ],
  },
  zh: {
    metadataTitle:
      "VDOT 训练计划生成器：5K、10K、半马与马拉松 | Trainingload.ai",
    metadataDescription:
      "输入当前 VDOT、目标距离和训练周期，生成包含 E/M/T/I/R 配速、逐周 Workout 和打印版的训练计划，并可导入 Trainingload.ai。",
    eyebrow: "免费确定性计划工具",
    title: "输入 VDOT，生成一份真正能执行的跑步训练计划",
    subtitle:
      "选择 5K、10K、半马或马拉松。当前 VDOT 决定训练强度，当前跑量和可训练日决定计划应该安排多少。",
    vdotOnlyNote:
      "无需上传活动文件。如果还不知道 VDOT，可以先用近期有代表性的比赛成绩计算。",
    labels: {
      vdot: "当前 VDOT",
      goal: "目标距离",
      weeks: "训练周期",
      weeklyDistance: "近 4 周平均周跑量",
      longestRun: "近 4 周最长跑（选填）",
      runsPerWeek: "每周跑步天数",
      longRunDay: "长跑日",
      startDate: "开始日期",
      unit: "距离单位",
      unavailable: "不可训练日",
      goalTime: "目标成绩（选填）",
    },
    actions: {
      generate: "生成我的计划",
      regenerate: "重新生成计划",
      calculate: "先计算 VDOT",
      print: "打印 / 保存 PDF",
      json: "下载 JSON",
      import: "导入 Trainingload.ai",
      backToGuide: "阅读训练法说明",
    },
    units: { metric: "公里", imperial: "英里" },
    goals: {
      "5K": "5 公里",
      "10K": "10 公里",
      HALF_MARATHON: "半程马拉松",
      MARATHON: "马拉松",
    },
    weekdays: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
    result: {
      title: "你的 VDOT 训练计划",
      summary: "计划摘要",
      paces: "训练配速",
      phases: "训练阶段",
      schedule: "逐周训练安排",
      week: "第",
      total: "训练",
      race: "比赛",
      workouts: "节训练",
      showWorkout: "查看训练步骤",
      hideWorkout: "收起训练步骤",
      generated: "生成时间",
      warning: "计划提示",
      disclaimer:
        "本计划参考 VDOT 与 E/M/T/I/R 训练理念，但不是 Jack Daniels 或 VDOT O2 官方计划。",
    },
    zones: {
      E: ["E · 轻松跑", "有氧发展与恢复"],
      M: ["M · 马拉松配速", "稳定专项节奏"],
      T: ["T · 乳酸阈值", "提高可持续速度"],
      I: ["I · 间歇跑", "提升最大有氧功率"],
      R: ["R · 重复跑", "改善经济性与放松速度"],
    },
    messages: {
      inputError: "请检查输入内容后再试。",
      vdotError: "当前 VDOT 需要在 20–85 之间。",
      periodError: "请选择当前目标距离支持的训练周期。",
      startDateError: "请选择有效的开始日期。",
      weeklyDistanceError: "近 4 周平均周跑量需要在 8–250 km 之间。",
      weeklyDistanceErrorImperial: "近 4 周平均周跑量需要在 5–155 mi 之间。",
      longestRunError: "近 4 周最长跑需要在 1–80 km 之间。",
      longestRunErrorImperial: "近 4 周最长跑需要在 1–50 mi 之间。",
      runDaysError: "每周跑步天数需要在 3–7 天之间。",
      unavailableDaysError: "可训练日数量不足以安排所选的每周跑步天数。",
      longRunDayError: "长跑日不能同时设置为不可训练日。",
      goalTimeError: "目标成绩请使用 HH:MM:SS 或 MM:SS 格式。",
      marathonFoundationError:
        "当前跑量和最长跑不足以安全完成这个马拉松周期；请选择至少 18 周，或先建立更充分的跑量基础。",
      generated: "已根据当前 VDOT 生成计划。",
      importError: "暂时无法准备导入，请重试。",
      noResult: "填写上方信息后即可生成计划。",
      volumeExplanation:
        "VDOT 决定配速，不决定跑量。请填写近 4 周平均值；相同 VDOT 的跑者可能分别习惯每周 20 km 和 70 km。",
    },
    howTitle: "生成器如何工作",
    howSteps: [
      ["1. 确定训练强度", "VDOT 解析为 E/M/T/I/R 配速区间。"],
      ["2. 编排训练周期", "目标、周期、当前跑量与可训练日共同决定阶段和负荷。"],
      ["3. 检查每一周", "规则引擎检查恢复间隔、质量日数量和 Workout 结构。"],
      [
        "4. 打印或导入",
        "可以保留纸质/PDF 版本，或在 Trainingload.ai 中确认结构化草稿。",
      ],
    ],
    faqTitle: "生成器常见问题",
    faq: [
      [
        "目标成绩会改变训练配速吗？",
        "不会。目标成绩只作参考，Workout 配速始终按照当前 VDOT。",
      ],
      [
        "为什么还要填写每周跑量？",
        "VDOT 描述训练强度；当前跑量可以避免系统给出远超近期承受能力的训练量。",
      ],
      [
        "导入后会自动激活吗？",
        "不会。导入只创建草稿，你确认后再决定是否激活。",
      ],
    ],
  },
} as const;

export function getVdotGeneratorCopy(locale: string) {
  if (locale === "zh-hant") {
    return {
      ...generator.zh,
      metadataTitle:
        "VDOT 訓練計畫產生器：5K、10K、半馬與馬拉松 | Trainingload.ai",
      title: "輸入 VDOT，產生一份真正能執行的跑步訓練計畫",
      actions: {
        ...generator.zh.actions,
        generate: "產生我的計畫",
        regenerate: "重新產生計畫",
        import: "匯入 Trainingload.ai",
      },
    };
  }
  return locale.startsWith("zh") ? generator.zh : generator.en;
}

export function appImportBase(locale: string) {
  const resolvedLocale = localePrefix(locale) || "/en";
  return `https://app.trainingload.ai${resolvedLocale}`;
}
