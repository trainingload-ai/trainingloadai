import {
  absoluteAlternatesForLocales,
  localePrefix,
} from "@/lib/locale-url";

export const VDOT_CONTENT_LOCALES = ["en", "zh", "zh-hant"] as const;

export function isVdotContentLocale(locale: string) {
  return (VDOT_CONTENT_LOCALES as readonly string[]).includes(locale);
}

export function vdotContentAlternates(siteUrl: string, path: string) {
  return absoluteAlternatesForLocales(siteUrl, path, VDOT_CONTENT_LOCALES);
}

function family(locale: string): "en" | "zh" | "zh-hant" {
  if (locale === "zh-hant") return "zh-hant";
  if (locale.startsWith("zh")) return "zh";
  return "en";
}

const guide = {
  en: {
    metadataTitle:
      "Daniels' Running Formula: VDOT and E/M/T/I/R Guide | Trainingload.ai",
    metadataDescription:
      "Understand publicly documented Daniels training principles, VDOT, E/M/T/I/R intensities, and what a responsible non-official adaptation must consider.",
    eyebrow: "Running method guide",
    title:
      "Daniels' Running Formula: from VDOT to a plan you can actually follow",
    subtitle:
      "Learn what VDOT means, why E/M/T/I/R workouts have different jobs, and how to turn current fitness—not wishful goal fitness—into a structured plan.",
    directAnswer:
      "Jack Daniels systematized a performance-based approach that uses VDOT to represent a runner's current, usable fitness. Training is divided into Easy, Marathon, Threshold, Interval, and Repetition intensities so each workout targets a distinct adaptation.",
    primaryCta: "Calculate my current VDOT",
    secondaryCta: "Explore training tools",
    toc: "On this page",
    tocItems: [
      ["what", "What the method is"],
      ["vdot", "What VDOT means"],
      ["paces", "E/M/T/I/R paces"],
      ["periodization", "How a plan is built"],
      ["mistakes", "Common mistakes"],
      ["faq", "FAQ"],
    ],
    whatTitle: "What is Daniels' Running Formula?",
    whatParagraphs: [
      "The method is more than a pace chart. It combines a current-fitness anchor, purpose-specific training intensities, workload limits, recovery, and race-specific periodization.",
      "The fourth edition of Daniels' Running Formula covers training principles, VDOT, training intensities, seasonal planning, and event-specific applications from middle distance through marathon and beyond.",
    ],
    lawsTitle: "The useful idea behind the method",
    lawsText:
      "Different runners can reach similar race results through different combinations of aerobic power, running economy, mechanics, and resilience. A useful plan therefore starts from demonstrated current performance and gives every hard session a specific purpose.",
    vdotTitle: "VDOT is a training anchor, not a lab VO₂max result",
    vdotParagraphs: [
      "VDOT is related to oxygen use, but it is not interchangeable with a laboratory VO₂max value or a watch estimate. It represents what a runner can currently turn into race performance, including the effect of running economy.",
      "Training paces should follow current VDOT. A target race time can guide the direction of a plan, but it should not be used to force faster workout paces before the runner has earned them.",
    ],
    paceTitle: "The five core training intensities",
    paceIntro:
      "The letters describe workout intent. They are not five equally important zones: most weekly running remains easy, while quality work is used selectively.",
    intensities: [
      {
        key: "E",
        name: "Easy",
        purpose:
          "Aerobic development, durability, recovery, and most long runs.",
        feel: "Conversational and controlled.",
        mistake: "Turning every easy day into moderate running.",
      },
      {
        key: "M",
        name: "Marathon",
        purpose:
          "Race-specific rhythm, fueling practice, and psychological familiarity.",
        feel: "Steady and controlled, with fatigue accumulating over time.",
        mistake: "Using it as a default pace for routine aerobic mileage.",
      },
      {
        key: "T",
        name: "Threshold",
        purpose:
          "Improve sustainable speed and the ability to clear and tolerate lactate.",
        feel: "Comfortably hard; short phrases, not conversation.",
        mistake: "Racing the workout instead of holding a repeatable effort.",
      },
      {
        key: "I",
        name: "Interval",
        purpose: "Accumulate effective time near maximal aerobic power.",
        feel: "Hard but controlled, commonly in repetitions of a few minutes.",
        mistake: "Starting each repetition as a sprint.",
      },
      {
        key: "R",
        name: "Repetition",
        purpose:
          "Improve economy, coordination, speed, and relaxed fast running.",
        feel: "Fast, smooth, and supported by generous recovery.",
        mistake:
          "Cutting recovery until the session becomes an endurance test.",
      },
    ],
    periodizationTitle: "How the intensities become a training plan",
    periodizationText:
      "A plan usually moves from aerobic consistency toward economy and quality, then becomes more specific to the goal race before tapering. The exact mix depends on goal distance, plan length, current volume, available days, and recovery—not VDOT alone.",
    goalRows: [
      ["5K", "E foundation, R economy, I aerobic power, T support"],
      ["10K", "E foundation, T durability, I longer intervals"],
      ["Half marathon", "E and long runs, T, controlled race-specific work"],
      ["Marathon", "E and long runs, M specificity, T, fueling and taper"],
    ],
    mistakesTitle: "Six mistakes an adapted plan should prevent",
    mistakes: [
      "Training at goal VDOT instead of current VDOT.",
      "Using VDOT to prescribe volume without asking about current mileage.",
      "Scheduling hard days back to back.",
      "Increasing volume and intensity aggressively in the same week.",
      "Making up a missed workout by stacking quality sessions.",
      "Holding an exact pace when heat, hills, altitude, or fatigue changes the cost.",
    ],
    generatorTitle: "VDOT alone is not a complete plan",
    generatorText:
      "VDOT can anchor intensity, but a responsible plan also needs recent volume, long-run durability, available days, recovery, goal distance, and a traceable method specification. Trainingload.ai does not currently publish a Daniels-branded or Daniels-adapted training plan.",
    generatorCta: "Calculate my current VDOT",
    sourcesTitle: "Sources and relationship disclosure",
    sourcesText:
      "Jack Daniels, Daniels' Running Formula, and VDOT are referenced only to explain publicly documented principles and identify source material. Trainingload.ai is not affiliated with, sponsored by, certified by, or endorsed by Jack Daniels, V.O2, or related organizations. This educational guide is not a training plan.",
    faqTitle: "Frequently asked questions",
    faq: [
      [
        "Is VDOT the same as VO₂max?",
        "No. VDOT is a performance-based training value. Laboratory VO₂max and watch estimates measure or estimate something related, but they are not interchangeable inputs.",
      ],
      [
        "Should I train at current or goal VDOT?",
        "Use current VDOT. Goal time can shape the plan, but it should not make today's workouts faster.",
      ],
      [
        "How often should VDOT change?",
        "Update it after a representative race or controlled test, not after every ordinary run. Keep completed workout prescriptions unchanged.",
      ],
      [
        "Is this an official Daniels plan?",
        "No. This is an educational guide, and Trainingload.ai does not currently publish a Daniels-branded or Daniels-adapted training plan.",
      ],
    ],
    safety:
      "This educational guide is not medical advice. Stop training and seek qualified care for chest pain, faintness, unusual shortness of breath, or persistent/worsening pain.",
  },
  zh: {
    metadataTitle:
      "丹尼尔斯经典跑步训练法：VDOT 与 E/M/T/I/R 完整指南 | Trainingload.ai",
    metadataDescription:
      "了解公开资料中的 Daniels 训练原则、VDOT、E/M/T/I/R 强度，以及负责任的非官方适配计划还需要哪些输入。",
    eyebrow: "跑步训练方法指南",
    title: "丹尼尔斯经典跑步训练法：从 VDOT 到一份能执行的训练计划",
    subtitle:
      "理解 VDOT、E/M/T/I/R 各自解决什么问题，并把当前跑力——而不是愿望中的目标跑力——转化为结构化计划。",
    directAnswer:
      "Jack Daniels 系统化提出了一套基于跑步表现的训练方法：用 VDOT 表示跑者当前能够兑现的能力，再把训练分为轻松、马拉松、阈值、间歇和重复跑，让不同 Workout 服务于不同适应目标。",
    primaryCta: "计算我的当前 VDOT",
    secondaryCta: "查看训练工具",
    toc: "本文内容",
    tocItems: [
      ["what", "训练法是什么"],
      ["vdot", "VDOT 是什么"],
      ["paces", "E/M/T/I/R 配速"],
      ["periodization", "如何组成计划"],
      ["mistakes", "常见错误"],
      ["faq", "常见问题"],
    ],
    whatTitle: "什么是丹尼尔斯经典跑步训练法？",
    whatParagraphs: [
      "它不只是一张配速表，而是把当前跑力、具有明确目的的训练强度、训练量上限、恢复和比赛专项周期组合在一起。",
      "《Daniels' Running Formula》第四版涵盖训练原则、VDOT、训练强度、赛季规划，以及从中距离到马拉松等项目的应用。",
    ],
    lawsTitle: "这套方法最有价值的思想",
    lawsText:
      "不同跑者可能依靠最大摄氧能力、跑步经济性、动作与耐受性的不同组合跑出相近成绩。因此计划应从已经表现出来的当前能力出发，并让每次质量训练都有清楚目的。",
    vdotTitle: "VDOT 是训练锚点，不是实验室 VO₂max",
    vdotParagraphs: [
      "VDOT 与氧利用能力有关，但不能直接等同于实验室最大摄氧量或手表估算值。它反映跑者当前能在比赛中兑现的综合能力，也间接包含跑步经济性的影响。",
      "训练配速应按照当前 VDOT。目标成绩可以决定计划方向，但不应在能力尚未达到时强行抬高训练配速。",
    ],
    paceTitle: "五种核心训练强度",
    paceIntro:
      "这些字母表达 Workout 的训练意图，并不代表五种强度应该平均出现；绝大多数跑量仍应保持轻松，质量训练只在必要时使用。",
    intensities: [
      {
        key: "E",
        name: "Easy｜轻松跑",
        purpose: "建立有氧能力、耐久性和恢复，也是多数长跑的基础。",
        feel: "可以交谈，呼吸受控。",
        mistake: "把每次轻松跑都跑成中等强度。",
      },
      {
        key: "M",
        name: "Marathon｜马拉松配速",
        purpose: "熟悉专项节奏、练习补给并建立比赛信心。",
        feel: "稳定可控，但持续时间越长疲劳越明显。",
        mistake: "把 M 配速当成日常有氧跑默认配速。",
      },
      {
        key: "T",
        name: "Threshold｜乳酸阈值",
        purpose: "提高可持续速度以及处理乳酸的能力。",
        feel: "舒服地难受，只能说短句。",
        mistake: "把训练跑成比赛，导致后半程失控。",
      },
      {
        key: "I",
        name: "Interval｜间歇跑",
        purpose: "累计接近最大有氧功率的有效训练时间。",
        feel: "很难但可控制，单组通常持续数分钟。",
        mistake: "每组一开始就冲刺。",
      },
      {
        key: "R",
        name: "Repetition｜重复跑",
        purpose: "改善跑步经济性、协调、速度和快速跑时的放松程度。",
        feel: "快速、流畅，组间恢复充分。",
        mistake: "缩短恢复，把动作训练做成耐力测试。",
      },
    ],
    periodizationTitle: "这些强度如何组成一份训练计划",
    periodizationText:
      "计划通常先建立稳定有氧基础，再发展跑步经济性与质量能力，之后接近目标赛事的专项需求，最后减量。具体组合取决于目标距离、周期、当前跑量、可训练日和恢复，而不只取决于 VDOT。",
    goalRows: [
      ["5K", "E 打底，R 改善经济性，I 提升有氧功率，T 提供持续能力"],
      ["10K", "E 打底，T 提升耐力，I 使用较长间歇"],
      ["半程马拉松", "E 与长跑为主，结合 T 和受控专项训练"],
      ["马拉松", "E 与长跑、M 专项、T、补给练习和减量"],
    ],
    mistakesTitle: "方法适配计划需要避免的六个错误",
    mistakes: [
      "按照目标 VDOT，而不是当前 VDOT 训练。",
      "只凭 VDOT 决定跑量，不询问当前周跑量。",
      "连续安排两个高强度训练日。",
      "同一周同时激进增加跑量和强度。",
      "漏训后通过堆叠质量课补课。",
      "天气炎热、爬坡、海拔或疲劳明显变化时仍死守配速。",
    ],
    generatorTitle: "VDOT 本身不是一份完整计划",
    generatorText:
      "VDOT 可以锚定强度，但负责任的计划还需要近期跑量、长跑耐受、可训练日、恢复、目标距离和可追溯的方法规则。Trainingload.ai 当前不发布 Daniels 命名或 Daniels 方法适配计划。",
    generatorCta: "计算我的当前 VDOT",
    sourcesTitle: "资料来源与关系声明",
    sourcesText:
      "Jack Daniels、《Daniels' Running Formula》和 VDOT 仅用于说明公开资料中的训练原则与资料来源。Trainingload.ai 与 Jack Daniels、V.O2 及相关机构不存在隶属、赞助、认证或背书关系。本页是训练教育指南，不是训练计划。",
    faqTitle: "常见问题",
    faq: [
      [
        "VDOT 等于最大摄氧量吗？",
        "不等于。VDOT 是基于跑步表现的训练数值；实验室 VO₂max 和手表估算值虽然相关，但不能直接互换。",
      ],
      [
        "应该按照当前 VDOT 还是目标 VDOT 训练？",
        "按照当前 VDOT。目标成绩可以决定计划方向，但不能直接让今天的训练配速变快。",
      ],
      [
        "多久更新一次 VDOT？",
        "在有代表性的比赛或可控测试后更新，不要因为每一次普通跑步而变化；已经完成的 Workout 处方保持不变。",
      ],
      [
        "这是官方 Daniels 计划吗？",
        "不是。本页是训练教育指南，Trainingload.ai 当前不发布 Daniels 命名或 Daniels 方法适配计划。",
      ],
    ],
    safety:
      "本文为训练教育内容，不构成医疗建议。出现胸痛、晕厥、异常呼吸困难或持续加重的疼痛时，应停止训练并寻求合格专业帮助。",
  },
  "zh-hant": null,
} as const;

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
  "zh-hant": null,
} as const;

export function getDanielsGuideCopy(locale: string) {
  const resolved = family(locale);
  if (resolved === "zh-hant") {
    return {
      ...guide.zh,
      metadataTitle:
        "丹尼爾斯經典跑步訓練法：VDOT 與 E/M/T/I/R 完整指南 | Trainingload.ai",
      title: "丹尼爾斯經典跑步訓練法：從 VDOT 到一份能執行的訓練計畫",
      primaryCta: "計算我的當前 VDOT",
      generatorCta: "計算我的當前 VDOT",
    };
  }
  return guide[resolved];
}

export function getVdotGeneratorCopy(locale: string) {
  const resolved = family(locale);
  if (resolved === "zh-hant") {
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
  return generator[resolved];
}

export function appImportBase(locale: string) {
  const resolvedLocale = localePrefix(locale) || "/en";
  return `https://app.trainingload.ai${resolvedLocale}`;
}
