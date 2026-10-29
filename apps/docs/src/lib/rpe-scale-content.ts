export const RPE_SCALE_PATH = "/rpe-scale";

export const RPE_SCALE_CONTENT_LOCALES = ["en", "zh", "ja", "zh-hant"] as const;

export type RpeScaleRow = {
  id: string;
  range: string;
  label: string;
  feel: string;
  talkTest: string;
  training: string;
};

export type RpeScaleContent = {
  metadataTitle: string;
  metadataDescription: string;
  keywords: string[];
  shortTitle: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  directAnswer: string;
  effortFirstLabel: string;
  primaryCta: string;
  secondaryCta: string;
  toc: string;
  tocItems: Array<[string, string]>;
  definitionTitle: string;
  definitionParagraphs: string[];
  scaleTitle: string;
  scaleIntro: string;
  scaleHeaders: [string, string, string, string, string];
  scaleRows: RpeScaleRow[];
  scaleCaution: string;
  plansTitle: string;
  plansIntro: string;
  plans: Array<{
    title: string;
    range: string;
    description: string;
    href: string;
  }>;
  compareTitle: string;
  compareIntro: string;
  comparisons: Array<{ title: string; strength: string; limitation: string }>;
  compareConclusion: string;
  coachTitle: string;
  coachParagraphs: string[];
  coachSteps: Array<{ title: string; description: string }>;
  meaningsTitle: string;
  meaningsIntro: string;
  meanings: Array<{ title: string; description: string; href?: string }>;
  calibrateTitle: string;
  calibrateIntro: string;
  calibrateSteps: string[];
  mistakesTitle: string;
  mistakes: string[];
  faqTitle: string;
  faq: Array<[string, string]>;
  sourcesTitle: string;
  sourceNote: string;
  safety: string;
  relatedTitle: string;
  related: Array<[string, string, string]>;
  homeLabel: string;
  scheduleGuideLabel: string;
  intensityLinkLabel: string;
};

const sharedPlanHrefs = {
  first: "/couch-to-5k-training-plan",
  finish: "/5k-training-plan",
  improve: "/5k-training-plan/intermediate",
} as const;

const content: Record<(typeof RPE_SCALE_CONTENT_LOCALES)[number], RpeScaleContent> = {
  en: {
    metadataTitle: "RPE Scale for Running: 1–10 Effort Chart | Trainingload.ai",
    metadataDescription:
      "Use the running RPE 1–10 scale and talk test to guide easy runs, tempo runs, intervals, and 5K training. Compare RPE with pace and heart rate.",
    keywords: [
      "RPE scale",
      "RPE scale running",
      "rate of perceived exertion",
      "running effort scale",
      "RPE 3-4",
      "talk test running",
      "RPE vs heart rate",
      "RPE vs pace",
    ],
    shortTitle: "RPE effort scale",
    eyebrow: "Training intensity guide",
    title: "RPE scale for running: understand effort from 1 to 10",
    subtitle:
      "Learn what RPE 3–4, 5–6, and 7–9 should feel like, how the talk test keeps effort honest, and why a useful plan does not always need a pace target.",
    directAnswer:
      "RPE means Rating of Perceived Exertion: a score for how hard exercise feels. Trainingload.ai uses a practical 1–10 scale, where 1 is almost no effort and 10 is a brief maximal effort. It describes internal effort, not a fixed pace.",
    effortFirstLabel: "Effort first. Pace second.",
    primaryCta: "See the RPE chart",
    secondaryCta: "Choose a 5K plan",
    toc: "On this page",
    tocItems: [
      ["what-is-rpe", "What RPE means"],
      ["rpe-scale", "RPE 1–10 chart"],
      ["5k-plans", "RPE in the 5K plans"],
      ["rpe-vs-pace-heart-rate", "RPE vs pace and heart rate"],
      ["ai-coach", "How the AI coach uses RPE"],
      ["rpe-meanings", "Three meanings of RPE"],
      ["faq", "FAQ"],
    ],
    definitionTitle: "What is RPE?",
    definitionParagraphs: [
      "RPE is a subjective intensity measure. Instead of asking only how fast you ran or what your heart rate was, it asks how demanding the effort felt based on breathing, muscular strain, and your overall sense of effort.",
      "The original Borg scale is commonly shown from 6 to 20. Running plans also use a simpler category-ratio style scale around 0 or 1 to 10. All Trainingload.ai plan labels on this page use 1–10, so RPE 4 never means 4 on the 6–20 scale.",
      "RPE is especially useful when heat, hills, wind, fatigue, sleep, or unfamiliar terrain changes the cost of a pace. It can be used alone when baseline data is sparse, or alongside pace and heart rate when reliable anchors exist.",
    ],
    scaleTitle: "The running RPE 1–10 chart",
    scaleIntro:
      "Use breathing, speech, control, and repeatability together. One signal on its own can be misleading.",
    scaleHeaders: ["RPE", "Effort", "How it feels", "Talk test", "Typical use"],
    scaleRows: [
      { id: "rpe-1-2", range: "1–2", label: "Very light", feel: "Little strain; relaxed movement", talkTest: "Normal conversation", training: "Walking, warm-up, recovery" },
      { id: "rpe-3-4", range: "3–4", label: "Easy", feel: "Comfortable and controlled", talkTest: "Full sentences", training: "Easy runs, recovery runs, run–walk" },
      { id: "rpe-5-6", range: "5–6", label: "Steady", feel: "Purposeful but sustainable", talkTest: "Short sentences", training: "Steady running, controlled long runs" },
      { id: "rpe-7-8", range: "7–8", label: "Hard", feel: "High focus; repeatable for planned work", talkTest: "Short phrases or a few words", training: "Tempo work, longer intervals, 5K effort" },
      { id: "rpe-9", range: "9", label: "Very hard", feel: "Near maximal; sustainable only briefly", talkTest: "One or two words", training: "Short intervals, late-race effort" },
      { id: "rpe-10", range: "10", label: "Maximum", feel: "All-out; cannot be repeated without full recovery", talkTest: "No talking", training: "Short sprint or finishing kick" },
    ],
    scaleCaution:
      "These are practical cues, not exact physiological conversions. RPE cannot be mapped one-to-one to a pace, heart-rate percentage, lactate value, or training zone for every athlete.",
    plansTitle: "How the official 5K plans use RPE",
    plansIntro:
      "The same number has a clear job inside each plan. Beginners receive fewer intensity decisions; experienced runners add quality work only when their baseline supports it.",
    plans: [
      { title: "First 5K", range: "Mostly RPE 3–4", description: "Run–walk sessions stay conversational while running intervals gradually lengthen. No invented pace target is required.", href: sharedPlanHrefs.first },
      { title: "Finish 5K", range: "RPE 3–6", description: "Easy and long runs stay at RPE 3–4, while controlled steady work reaches RPE 5–6.", href: sharedPlanHrefs.finish },
      { title: "Improve 5K", range: "RPE 3–9", description: "Easy days remain easy; tempo, interval, and 5K-specific sessions rise to RPE 6–9 with recovery between quality days.", href: sharedPlanHrefs.improve },
    ],
    compareTitle: "RPE vs pace vs heart rate",
    compareIntro:
      "These measures answer different questions. A good plan chooses the smallest reliable set rather than pretending one metric is always superior.",
    comparisons: [
      { title: "RPE", strength: "Works without a device and responds immediately to heat, hills, fatigue, and sleep.", limitation: "Requires practice and a consistent definition of the scale." },
      { title: "Pace", strength: "Specific and easy to verify when recent performance provides a trustworthy anchor.", limitation: "Terrain, weather, altitude, and GPS error can change its physiological cost." },
      { title: "Heart rate", strength: "Shows internal cardiovascular response and is useful for aerobic trend review.", limitation: "Lags during short intervals and is affected by sensor quality, heat, hydration, and stress." },
    ],
    compareConclusion:
      "With a reliable recent result, pace can guide quality work while RPE checks whether today's cost is appropriate. Without that anchor, RPE and the talk test are safer than making up a pace.",
    coachTitle: "How the Trainingload.ai coach uses RPE",
    coachParagraphs: [
      "Official templates are generated, structurally validated, reviewed, and then frozen. Opening or creating one of these templates does not ask the model to rewrite its workouts; the published RPE and schedule are stable.",
      "For an AI-customized plan, the coach can use the athlete information you authorize. If no reliable recent 5K result or pace anchor exists, RPE becomes the primary intensity language. If the baseline is reliable, pace targets can guide quality steps while RPE remains a safety and reality check.",
    ],
    coachSteps: [
      { title: "Read the baseline", description: "Use available running history, continuous-run ability, training days, and reliable recent results." },
      { title: "Choose the anchor", description: "Use RPE when evidence is sparse; add pace or VDOT targets only when the data supports them." },
      { title: "Keep the workout executable", description: "Every step retains a purpose, effort cue, recovery requirement, and assumption the runner can understand." },
    ],
    meaningsTitle: "Three meanings of RPE that should not be mixed",
    meaningsIntro:
      "The acronym appears in endurance plans, training-load analysis, and strength training, but the question being answered is different.",
    meanings: [
      { title: "Workout-step RPE", description: "How hard the current running segment should feel. This is what RPE 3–4 on a 5K calendar means." },
      { title: "Session RPE", description: "A single rating for how hard the entire completed workout felt, used with duration to estimate internal training load.", href: "/training-load" },
      { title: "Strength-set RPE", description: "How close a completed set was to failure, often interpreted with repetitions in reserve. Do not apply that definition directly to a running interval.", href: "/docs/planning/strength-workout-dsl" },
    ],
    calibrateTitle: "Calibrate your RPE over the first two to three weeks",
    calibrateIntro:
      "RPE becomes more useful with consistent practice. Accuracy does not require perfect physiology knowledge.",
    calibrateSteps: [
      "Before checking your watch, name the effort and test whether you can speak at the expected level.",
      "During intervals, rate the work segment—not the easy recovery between repetitions.",
      "After the workout, record a separate overall session RPE instead of copying the hardest moment.",
      "Compare similar routes over several weeks. If the same pace feels easier at similar conditions, that is useful progress evidence.",
    ],
    mistakesTitle: "Common RPE mistakes",
    mistakes: [
      "Calling every easy run RPE 1–2 even though running still requires noticeable effort.",
      "Letting easy days drift to RPE 6 because the pace looks too slow on the watch.",
      "Treating RPE as an exact conversion table for heart rate, pace, or power.",
      "Rating only leg discomfort while ignoring breathing and whole-body effort—or doing the reverse.",
      "Using the strength-training RPE/RIR definition for a complete running session.",
      "Turning RPE 10 into a routine target instead of reserving it for brief maximal efforts.",
    ],
    faqTitle: "Frequently asked questions",
    faq: [
      ["What does RPE stand for?", "RPE stands for Rating of Perceived Exertion. It is a score for how hard exercise feels, based on breathing, muscular strain, and overall effort rather than one device measurement."],
      ["What does RPE 3–4 feel like when running?", "It should feel easy and controlled. You can speak in full sentences, your breathing is clearly above rest but not strained, and you could continue longer than the planned duration."],
      ["What RPE should an easy run be?", "Most easy and recovery running in these plans is RPE 3–4. The exact pace can change with heat, hills, fatigue, and running experience while the intended effort stays easy."],
      ["What RPE is a 5K race?", "A well-paced 5K commonly progresses from hard and controlled toward very hard near the finish, roughly RPE 7–9 for many runners. Beginners aiming only to finish may deliberately stay lower."],
      ["Can I train by RPE without a heart-rate monitor?", "Yes. RPE and the talk test can prescribe useful intensity without a device. A heart-rate monitor adds another signal, but it does not replace judgment or make RPE unnecessary."],
      ["Why does the same pace have a different RPE on different days?", "Heat, wind, hills, sleep, hydration, stress, illness, and accumulated fatigue can all change the cost of a pace. That responsiveness is one reason plans use RPE."],
      ["Can RPE be converted directly to heart-rate zones or pace?", "No exact universal conversion exists. The measures are related, but individual fitness, environment, exercise type, and measurement method change the relationship."],
      ["How is running RPE different from RPE and RIR in strength training?", "Running RPE describes the perceived intensity of a segment or session. Strength RPE is often tied to how many repetitions remained before failure. The same number therefore does not carry an identical operational meaning."],
      ["When should I slow down or stop?", "Slow down when you cannot meet the workout's intended talk-test or effort cue. Stop and seek qualified medical care for chest pain, faintness, unusual shortness of breath, or persistent or worsening pain."],
      ["How long does it take to learn RPE?", "Most runners become more consistent after two to three weeks of rating comparable sessions. Use the same scale, instructions, and timing so the observations remain comparable."],
    ],
    sourcesTitle: "Sources and scope",
    sourceNote:
      "This guide uses established perceived-exertion research and public intensity guidance, then translates them into the 1–10 language used by Trainingload.ai plans.",
    safety:
      "This educational guide is not medical advice. Stop training and seek qualified care for chest pain, faintness, unusual shortness of breath, or persistent or worsening pain.",
    relatedTitle: "Put the effort scale into practice",
    related: [
      ["First 5K plan", sharedPlanHrefs.first, "Start with conversational run–walk training at RPE 3–4."],
      ["Finish 5K plan", sharedPlanHrefs.finish, "Use easy and steady effort to build toward a complete 5K."],
      ["Improve 5K plan", sharedPlanHrefs.improve, "Combine RPE with tempo, interval, and optional VDOT pace anchors."],
      ["VDOT calculator", "/vdot-calculator", "Add pace targets when a reliable performance anchor exists."],
      ["Training load", "/training-load", "Understand how session RPE differs from workout-step RPE."],
    ],
    homeLabel: "Home",
    scheduleGuideLabel: "Not sure what RPE means? Read the 1–10 RPE effort guide.",
    intensityLinkLabel: "Open the RPE effort guide",
  },
  zh: {
    metadataTitle: "RPE 是什么？跑步 1–10 主观强度表 | Trainingload.ai",
    metadataDescription:
      "了解跑步 RPE 1–10 强度表、谈话测试，以及轻松跑、节奏跑、间歇和 5K 训练应该使用什么 RPE，并比较 RPE、配速与心率。",
    keywords: ["RPE 是什么", "RPE 强度", "RPE 量表", "跑步 RPE", "RPE 3-4", "主观用力程度", "谈话测试", "RPE 和心率"],
    shortTitle: "RPE 主观强度表",
    eyebrow: "训练强度指南",
    title: "RPE 是什么？看懂跑步 1–10 主观强度",
    subtitle:
      "弄清 RPE 3–4、5–6 和 7–9 应该是什么体感，学会用谈话测试校验强度，也理解为什么一份可靠计划不一定总要给出配速。",
    directAnswer:
      "RPE 是主观用力程度评分，用来描述运动感觉有多吃力。Trainingload.ai 使用实用的 1–10 分量表：1 代表几乎没有负荷，10 代表只能短时间维持的最大努力。它描述的是身体内部负荷，不是固定配速。",
    effortFirstLabel: "先判断体感，再参考配速。",
    primaryCta: "查看 RPE 强度表",
    secondaryCta: "选择 5K 计划",
    toc: "本文内容",
    tocItems: [["what-is-rpe", "RPE 是什么"], ["rpe-scale", "RPE 1–10 强度表"], ["5k-plans", "5K 计划如何使用 RPE"], ["rpe-vs-pace-heart-rate", "RPE、配速与心率"], ["ai-coach", "智能教练如何使用 RPE"], ["rpe-meanings", "三种 RPE 的区别"], ["faq", "常见问题"]],
    definitionTitle: "什么是 RPE？",
    definitionParagraphs: [
      "RPE 是一种主观强度指标。它不只问你跑了多快、心率是多少，而是综合呼吸、肌肉负担和全身体感，判断这段运动对你来说有多难。",
      "传统 Borg 量表常见 6–20 分版本，耐力训练也常使用更容易理解的 0 或 1–10 分版本。Trainingload.ai 计划统一使用 1–10 分，因此计划里的 RPE 4 不是 6–20 量表中的 4。",
      "炎热、爬坡、逆风、疲劳、睡眠和陌生路线都会改变同一配速的实际代价。基线不足时可以单独使用 RPE；有可靠数据时，也可以把它与配速和心率结合。",
    ],
    scaleTitle: "跑步 RPE 1–10 强度表",
    scaleIntro: "同时观察呼吸、说话能力、控制感和能否重复完成。只看其中一个信号容易误判。",
    scaleHeaders: ["RPE", "强度", "身体感觉", "谈话测试", "典型训练"],
    scaleRows: [
      { id: "rpe-1-2", range: "1–2", label: "非常轻松", feel: "几乎没有压力，动作放松", talkTest: "可以正常交谈", training: "步行、热身、恢复" },
      { id: "rpe-3-4", range: "3–4", label: "轻松", feel: "舒适、稳定、可控制", talkTest: "可以说完整句子", training: "轻松跑、恢复跑、跑走交替" },
      { id: "rpe-5-6", range: "5–6", label: "稳态", feel: "需要专注，但可以持续", talkTest: "可以说短句", training: "稳态跑、受控长跑" },
      { id: "rpe-7-8", range: "7–8", label: "较难", feel: "需要高度专注，仍能按计划重复", talkTest: "只能说短语或几个词", training: "节奏跑、较长间歇、5K 强度" },
      { id: "rpe-9", range: "9", label: "非常难", feel: "接近最大，只能短时间维持", talkTest: "只能说一两个词", training: "短间歇、比赛后段" },
      { id: "rpe-10", range: "10", label: "最大努力", feel: "全力输出，充分恢复前无法重复", talkTest: "无法说话", training: "短冲刺、终点冲刺" },
    ],
    scaleCaution:
      "这些是便于执行的体感线索，不是精确生理换算。RPE 不能对所有人一一对应到固定配速、最大心率百分比、乳酸值或训练区间。",
    plansTitle: "三个官方 5K 计划如何使用 RPE",
    plansIntro: "同一个数字在计划中有明确任务。入门者减少强度决策，具备可靠基线后才逐步加入质量训练。",
    plans: [
      { title: "零基础第一个 5K", range: "以 RPE 3–4 为主", description: "跑走训练保持可以交谈，再逐步延长跑步段；不需要编造目标配速。", href: sharedPlanHrefs.first },
      { title: "稳定完成 5K", range: "RPE 3–6", description: "轻松跑和长跑保持 RPE 3–4，受控稳态训练提高到 RPE 5–6。", href: sharedPlanHrefs.finish },
      { title: "提升 5K 表现", range: "RPE 3–9", description: "轻松日继续轻松，节奏、间歇和 5K 专项训练达到 RPE 6–9，质量日之间保留恢复。", href: sharedPlanHrefs.improve },
    ],
    compareTitle: "RPE、配速和心率应该看哪个？",
    compareIntro: "三个指标回答的问题不同。可靠计划会选择最少但可信的指标，而不是假设其中一个永远最好。",
    comparisons: [
      { title: "RPE", strength: "不需要设备，并能立即反映炎热、坡度、疲劳和睡眠。", limitation: "需要练习，并始终使用相同量表定义。" },
      { title: "配速", strength: "近期成绩提供可靠锚点时，目标具体并且容易核对。", limitation: "地形、天气、海拔和 GPS 误差都会改变同一配速的代价。" },
      { title: "心率", strength: "可以观察心血管内部反应，适合复盘有氧趋势。", limitation: "短间歇中存在延迟，也会受设备、炎热、补水和压力影响。" },
    ],
    compareConclusion: "有可靠近期成绩时，可以用配速指导质量课，用 RPE 检查当天代价是否合理；没有锚点时，RPE 和谈话测试比编造配速更稳妥。",
    coachTitle: "Trainingload.ai 的智能教练如何使用 RPE",
    coachParagraphs: [
      "官方模板先由模型生成候选，再经过结构校验、审核和冻结。用户打开或创建官方模板时，模型不会重新改写 Workout，页面中的 RPE 和日程是稳定版本。",
      "智能教练定制计划可以读取用户授权的运动基线。没有可靠近期 5K 成绩或配速锚点时，RPE 是主要强度语言；基线可靠时，质量训练可以增加配速目标，同时保留 RPE 校验当天真实状态。",
    ],
    coachSteps: [
      { title: "读取运动基线", description: "使用已有跑步历史、连续跑能力、可训练日和可靠近期成绩。" },
      { title: "选择强度锚点", description: "证据稀疏时使用 RPE；数据足够时才加入配速或 VDOT。" },
      { title: "保持训练可执行", description: "每个步骤都保留训练目的、体感提示、恢复要求和用户能理解的假设。" },
    ],
    meaningsTitle: "不要混淆三种 RPE",
    meaningsIntro: "这个缩写会出现在耐力计划、训练负荷和力量训练中，但它们回答的问题不同。",
    meanings: [
      { title: "Workout 步骤 RPE", description: "当前跑步训练段应该有多难。5K 日历里的 RPE 3–4 指的就是这个。" },
      { title: "Session RPE", description: "整次训练完成后的总体难度，可以结合时长估算内部训练负荷。", href: "/training-load" },
      { title: "力量训练 Set RPE", description: "一组动作距离力竭有多近，常结合剩余重复次数解释，不能直接套用到跑步间歇。", href: "/docs/planning/strength-workout-dsl" },
    ],
    calibrateTitle: "用前两到三周校准自己的 RPE",
    calibrateIntro: "持续练习后，RPE 才会越来越有价值；不需要先掌握复杂运动生理。",
    calibrateSteps: [
      "看手表前先说出体感等级，再检查自己能否达到对应谈话程度。",
      "间歇训练评价工作段，不要用组间轻松恢复的感觉代替。",
      "训练结束后单独记录整节 Session RPE，不要直接复制最难的一刻。",
      "连续数周比较相似路线；条件相近时同样配速感觉更轻松，就是有价值的进步证据。",
    ],
    mistakesTitle: "常见 RPE 错误",
    mistakes: [
      "因为名称叫轻松跑，就把所有轻松跑都评为 RPE 1–2。",
      "因为手表配速看起来太慢，让轻松日逐渐跑到 RPE 6。",
      "把 RPE 当作心率、配速或功率的精确换算表。",
      "只评价腿部酸痛而忽略呼吸和全身负担，或者反过来。",
      "把力量训练中的 RPE/RIR 定义直接用于整次跑步。",
      "把 RPE 10 当作日常目标，而不是极短最大努力。",
    ],
    faqTitle: "常见问题",
    faq: [
      ["RPE 是什么意思？", "RPE 是 Rating of Perceived Exertion，即主观用力程度评分。它综合呼吸、肌肉负担和整体努力感，表示运动对你来说有多难，而不是某个设备的单项读数。"],
      ["跑步 RPE 3–4 是什么感觉？", "应该感觉轻松、稳定、可控制。你可以说完整句子，呼吸比静息明显但不紧张，并且感觉还能继续跑得比计划时间更久。"],
      ["轻松跑应该保持多少 RPE？", "这些计划中的轻松跑和恢复跑多数保持 RPE 3–4。炎热、爬坡、疲劳和跑步经验会改变实际配速，但轻松体感不应改变。"],
      ["5K 比赛通常是多少 RPE？", "合理配速的 5K 通常会从较难但可控逐步提高到终点附近的非常难，许多跑者约为 RPE 7–9。只求完赛的初学者可以有意保持更低强度。"],
      ["没有心率表，可以只用 RPE 训练吗？", "可以。RPE 配合谈话测试足以指导有效训练。心率表能增加一个观察信号，但不能代替判断，也不会让 RPE 失去作用。"],
      ["为什么同样配速每天的 RPE 不一样？", "炎热、风、坡度、睡眠、补水、压力、身体不适和累积疲劳都会改变同一配速的代价，这种敏感性正是计划使用 RPE 的原因之一。"],
      ["RPE 能直接换算成心率区间或配速吗？", "不能精确换算。它们彼此相关，但个人能力、环境、运动类型和测量方法都会改变这种关系。"],
      ["跑步 RPE 和力量训练的 RPE/RIR 有什么区别？", "跑步 RPE 描述一段或整次运动的主观强度；力量训练 RPE 常与距离力竭还剩多少次重复有关，因此同一个数字并不代表完全相同的执行含义。"],
      ["什么时候应该减速或停止训练？", "无法满足计划的谈话测试或体感提示时应先减速。出现胸痛、晕厥、异常呼吸困难，或持续、加重的疼痛时应停止并寻求专业医疗帮助。"],
      ["初学者多久能学会判断 RPE？", "多数跑者在连续两到三周评价相似训练后会更加稳定。关键是使用相同量表、相同问题和相近记录时机。"],
    ],
    sourcesTitle: "资料来源与适用范围",
    sourceNote: "本指南以主观用力程度研究和公开运动强度指南为依据，再转化为 Trainingload.ai 计划使用的 1–10 分训练语言。",
    safety: "本页是训练教育内容，不构成医疗建议。出现胸痛、晕厥、异常呼吸困难，或持续、加重的疼痛时，请停止训练并寻求专业医疗帮助。",
    relatedTitle: "把 RPE 强度表用到计划中",
    related: [
      ["零基础第一个 5K", sharedPlanHrefs.first, "从 RPE 3–4、能够交谈的跑走训练开始。"],
      ["稳定完成 5K", sharedPlanHrefs.finish, "用轻松和稳态强度逐步建立完整 5K 能力。"],
      ["提升 5K 表现", sharedPlanHrefs.improve, "把 RPE 与节奏、间歇和可选 VDOT 配速结合。"],
      ["VDOT 计算器", "/vdot-calculator", "有可靠表现锚点时，再增加配速目标。"],
      ["训练负荷", "/training-load", "理解 Session RPE 与 Workout 步骤 RPE 的区别。"],
    ],
    homeLabel: "首页",
    scheduleGuideLabel: "不熟悉 RPE？先看 RPE 1–10 主观强度表。",
    intensityLinkLabel: "打开 RPE 主观强度指南",
  },
  ja: {
    metadataTitle: "RPEとは？ランニングの1〜10運動強度表 | Trainingload.ai",
    metadataDescription: "ランニングのRPE 1〜10表とトークテストを使い、イージーラン、テンポ走、インターバル、5Kトレーニングの強度を理解します。",
    keywords: ["RPEとは", "RPE ランニング", "RPE スケール", "自覚的運動強度", "RPE 3-4", "トークテスト"],
    shortTitle: "RPE運動強度表",
    eyebrow: "トレーニング強度ガイド",
    title: "RPEとは？ランニングの運動強度を1〜10で理解する",
    subtitle: "RPE 3〜4、5〜6、7〜9の体感、トークテストによる確認方法、そして信頼できる計画が必ずしもペース目標を必要としない理由を解説します。",
    directAnswer: "RPEは自覚的運動強度を示す評価です。Trainingload.aiでは1〜10を使用し、1はほぼ負荷なし、10は短時間しか維持できない最大努力です。固定ペースではなく、身体にかかる内的な強度を表します。",
    effortFirstLabel: "まず体感、次にペース。",
    primaryCta: "RPE表を見る",
    secondaryCta: "5Kプランを選ぶ",
    toc: "このページの内容",
    tocItems: [["what-is-rpe", "RPEとは"], ["rpe-scale", "RPE 1〜10表"], ["5k-plans", "5KプランでのRPE"], ["rpe-vs-pace-heart-rate", "RPE・ペース・心拍数"], ["ai-coach", "AIコーチとRPE"], ["rpe-meanings", "3種類のRPE"], ["faq", "よくある質問"]],
    definitionTitle: "RPEとは？",
    definitionParagraphs: ["RPEは主観的な強度指標です。速さや心拍数だけでなく、呼吸、筋肉の負担、全身の努力感を合わせて運動のきつさを判断します。", "Borgの原尺度には6〜20がありますが、持久系トレーニングでは0または1〜10も広く使われます。Trainingload.aiのプランは1〜10に統一しています。", "暑さ、坂、風、疲労、睡眠、路面によって同じペースの負担は変わります。データが少ない場合はRPEを中心にし、信頼できる基準があればペースや心拍数と組み合わせます。"],
    scaleTitle: "ランニングRPE 1〜10表",
    scaleIntro: "呼吸、会話、コントロール感、反復可能性を合わせて判断します。",
    scaleHeaders: ["RPE", "強度", "体感", "トークテスト", "代表的な練習"],
    scaleRows: [
      { id: "rpe-1-2", range: "1–2", label: "非常に軽い", feel: "負担がほとんどなくリラックス", talkTest: "普通に会話できる", training: "歩行、ウォームアップ、回復" },
      { id: "rpe-3-4", range: "3–4", label: "イージー", feel: "快適でコントロール可能", talkTest: "文章で話せる", training: "イージー、回復、ラン＆ウォーク" },
      { id: "rpe-5-6", range: "5–6", label: "ステディ", feel: "集中が必要だが持続可能", talkTest: "短い文章で話せる", training: "ステディ走、抑えたロング走" },
      { id: "rpe-7-8", range: "7–8", label: "ハード", feel: "高い集中が必要だが計画通り反復可能", talkTest: "短いフレーズか数語", training: "テンポ、長めのインターバル、5K強度" },
      { id: "rpe-9", range: "9", label: "非常にハード", feel: "最大に近く短時間のみ", talkTest: "一、二語", training: "短いインターバル、レース終盤" },
      { id: "rpe-10", range: "10", label: "最大努力", feel: "全力で、十分な回復なしに反復不能", talkTest: "話せない", training: "短いスプリント、ラストスパート" },
    ],
    scaleCaution: "これは実践的な目安であり、正確な生理学的換算ではありません。RPEを固定ペース、心拍率、乳酸値、ゾーンへ一対一で変換することはできません。",
    plansTitle: "公式5KプランでのRPEの使い方",
    plansIntro: "初心者は強度判断をシンプルにし、信頼できる基準があるランナーだけが段階的に質の高い練習を追加します。",
    plans: [
      { title: "初めての5K", range: "主にRPE 3–4", description: "会話できるラン＆ウォークから走る区間を延ばします。架空の目標ペースは設定しません。", href: sharedPlanHrefs.first },
      { title: "5K完走", range: "RPE 3–6", description: "イージーとロングはRPE 3〜4、ステディはRPE 5〜6です。", href: sharedPlanHrefs.finish },
      { title: "5K向上", range: "RPE 3–9", description: "イージー日は軽く、テンポ、インターバル、5K特異的練習はRPE 6〜9まで上げます。", href: sharedPlanHrefs.improve },
    ],
    compareTitle: "RPE・ペース・心拍数の使い分け",
    compareIntro: "3つは異なる問いに答えます。計画は、常に1つを優先するのではなく、信頼できる最小限の指標を選びます。",
    comparisons: [
      { title: "RPE", strength: "機器不要で、暑さ、坂、疲労、睡眠をすぐ反映します。", limitation: "練習と一貫した尺度の定義が必要です。" },
      { title: "ペース", strength: "信頼できる直近記録があれば具体的で確認しやすい指標です。", limitation: "地形、天候、標高、GPS誤差で負担が変わります。" },
      { title: "心拍数", strength: "心血管系の内的反応と有酸素傾向を確認できます。", limitation: "短いインターバルでは遅れ、センサーや暑さ、脱水、ストレスにも影響されます。" },
    ],
    compareConclusion: "信頼できる記録があれば質の高い練習をペースで導き、RPEで当日の負担を確認します。基準がなければ、架空のペースよりRPEとトークテストが安全です。",
    coachTitle: "Trainingload.aiのAIコーチはRPEをどう使うか",
    coachParagraphs: ["公式テンプレートは候補生成、構造検証、レビュー、固定化を経ています。閲覧・作成時にモデルがWorkoutを書き換えることはなく、RPEと日程は安定しています。", "AIカスタムプランは許可されたランニング基準を使用します。信頼できる直近5K記録がなければRPEを主軸とし、基準があれば質の高い区間にペース目標を加えつつRPEで現実性を確認します。"],
    coachSteps: [
      { title: "基準を読む", description: "走歴、連続走能力、利用可能日、信頼できる直近記録を使います。" },
      { title: "強度の軸を選ぶ", description: "証拠が少なければRPE、十分ならペースやVDOTを追加します。" },
      { title: "実行可能に保つ", description: "各ステップに目的、体感、回復、前提を明記します。" },
    ],
    meaningsTitle: "混同してはいけない3種類のRPE",
    meaningsIntro: "持久系プラン、トレーニング負荷、筋力トレーニングでは同じ略語でも問いが異なります。",
    meanings: [
      { title: "WorkoutステップRPE", description: "現在のランニング区間がどれだけきついべきか。5KカレンダーのRPE 3〜4はこれです。" },
      { title: "Session RPE", description: "完了したセッション全体の難度。時間と組み合わせて内的負荷を推定します。", href: "/training-load" },
      { title: "筋力セットRPE", description: "失敗まであと何回できたかに近い概念。ランニング区間へ直接当てはめません。", href: "/docs/planning/strength-workout-dsl" },
    ],
    calibrateTitle: "最初の2〜3週間でRPEを調整する",
    calibrateIntro: "同じ尺度を継続して使うことで判断は安定します。",
    calibrateSteps: ["時計を見る前に強度を言葉にし、会話できる程度を確認します。", "インターバルでは回復区間ではなく運動区間を評価します。", "終了後は最もきつい瞬間ではなく、セッション全体のRPEを別に記録します。", "数週間、似たコースと条件で比較します。"],
    mistakesTitle: "よくあるRPEの誤り",
    mistakes: ["イージーという名前だけでRPE 1〜2と評価する。", "時計のペースを優先してイージー日をRPE 6まで上げる。", "RPEを心拍数やペースの正確な換算表として使う。", "脚の不快感だけ、または呼吸だけで評価する。", "筋力トレーニングのRPE/RIRをランニング全体へ当てはめる。", "RPE 10を日常の目標にする。"],
    faqTitle: "よくある質問",
    faq: [
      ["RPEとは何の略ですか？", "Rating of Perceived Exertion、つまり自覚的運動強度です。呼吸、筋肉の負担、全体の努力感から運動のきつさを評価します。"],
      ["ランニングのRPE 3〜4はどんな感覚ですか？", "楽でコントロールでき、文章で会話できます。呼吸は安静時より増えますが苦しくなく、予定より長く続けられる感覚です。"],
      ["イージーランは何RPEですか？", "このプランでは多くのイージー・回復ランがRPE 3〜4です。暑さ、坂、疲労でペースは変わっても、目的の体感は変えません。"],
      ["5Kレースは何RPEですか？", "多くのランナーはコントロールされたハードから終盤の非常にハードへ進み、概ねRPE 7〜9です。完走目的の初心者は低めで構いません。"],
      ["心拍計なしでRPEだけで練習できますか？", "できます。RPEとトークテストで有効な強度を設定できます。心拍数は追加の信号ですが、判断を置き換えるものではありません。"],
      ["同じペースなのにRPEが違うのはなぜですか？", "暑さ、風、坂、睡眠、水分、ストレス、体調、蓄積疲労が同じペースの負担を変えるためです。"],
      ["RPEを心拍ゾーンやペースへ換算できますか？", "普遍的な正確換算はありません。能力、環境、運動種目、測定方法で関係が変わります。"],
      ["ランニングRPEと筋力トレーニングのRPE/RIRはどう違いますか？", "ランニングでは区間やセッションの主観強度、筋力では失敗まで残る反復回数と結びつくことが多く、同じ数値でも意味は同一ではありません。"],
      ["いつ減速または中止すべきですか？", "予定した会話・体感を守れなければ減速します。胸痛、失神、異常な息切れ、持続・悪化する痛みがあれば中止し医療専門家へ相談してください。"],
      ["RPEを学ぶのにどれくらいかかりますか？", "多くのランナーは似た練習を2〜3週間評価すると安定します。同じ尺度とタイミングを使ってください。"],
    ],
    sourcesTitle: "出典と適用範囲",
    sourceNote: "本ガイドは自覚的運動強度の研究と公的な強度ガイドを、Trainingload.aiの1〜10表現へ翻訳しています。",
    safety: "本ページは教育目的であり医療助言ではありません。胸痛、失神、異常な息切れ、持続・悪化する痛みがある場合は運動を中止し、専門家へ相談してください。",
    relatedTitle: "RPEをプランで使う",
    related: [["初めての5K", sharedPlanHrefs.first, "RPE 3〜4の会話できるラン＆ウォークから開始します。"], ["5K完走", sharedPlanHrefs.finish, "イージーとステディで5K完走へ進みます。"], ["5K向上", sharedPlanHrefs.improve, "RPEとテンポ、インターバル、VDOTを組み合わせます。"], ["VDOT計算", "/vdot-calculator", "信頼できる記録がある場合にペース目標を追加します。"], ["トレーニング負荷", "/training-load", "Session RPEとの違いを理解します。"]],
    homeLabel: "ホーム",
    scheduleGuideLabel: "RPEが分からない場合は、1〜10の運動強度ガイドを確認してください。",
    intensityLinkLabel: "RPE運動強度ガイドを開く",
  },
  "zh-hant": {
    metadataTitle: "RPE 是什麼？跑步 1–10 主觀強度表 | Trainingload.ai",
    metadataDescription: "了解跑步 RPE 1–10 強度表、談話測試，以及輕鬆跑、節奏跑、間歇與 5K 訓練應使用什麼 RPE，並比較 RPE、配速與心率。",
    keywords: ["RPE 是什麼", "RPE 強度", "RPE 量表", "跑步 RPE", "主觀用力程度", "談話測試"],
    shortTitle: "RPE 主觀強度表",
    eyebrow: "訓練強度指南",
    title: "RPE 是什麼？看懂跑步 1–10 主觀強度",
    subtitle: "弄清 RPE 3–4、5–6 和 7–9 應有的體感，學會以談話測試校驗強度，也理解可靠計畫為何不一定總要給出配速。",
    directAnswer: "RPE 是主觀用力程度評分，用來描述運動感覺有多吃力。Trainingload.ai 使用 1–10 分量表：1 代表幾乎沒有負荷，10 代表只能短時間維持的最大努力。它描述內部負荷，而非固定配速。",
    effortFirstLabel: "先判斷體感，再參考配速。",
    primaryCta: "查看 RPE 強度表",
    secondaryCta: "選擇 5K 計畫",
    toc: "本文內容",
    tocItems: [["what-is-rpe", "RPE 是什麼"], ["rpe-scale", "RPE 1–10 強度表"], ["5k-plans", "5K 計畫如何使用 RPE"], ["rpe-vs-pace-heart-rate", "RPE、配速與心率"], ["ai-coach", "AI 教練如何使用 RPE"], ["rpe-meanings", "三種 RPE 的差異"], ["faq", "常見問題"]],
    definitionTitle: "什麼是 RPE？",
    definitionParagraphs: ["RPE 是主觀強度指標。它不只問跑了多快、心率多少，而是綜合呼吸、肌肉負擔與全身感受，判斷運動有多難。", "傳統 Borg 量表常見 6–20 分版本，耐力訓練也常使用 0 或 1–10 分版本。Trainingload.ai 計畫統一使用 1–10 分。", "炎熱、爬坡、逆風、疲勞、睡眠與陌生路線都會改變同一配速的代價。基線不足時可單獨使用 RPE；有可靠資料時則可結合配速與心率。"],
    scaleTitle: "跑步 RPE 1–10 強度表",
    scaleIntro: "同時觀察呼吸、說話能力、控制感與能否重複完成。",
    scaleHeaders: ["RPE", "強度", "身體感覺", "談話測試", "典型訓練"],
    scaleRows: [
      { id: "rpe-1-2", range: "1–2", label: "非常輕鬆", feel: "幾乎沒有壓力，動作放鬆", talkTest: "可以正常交談", training: "步行、熱身、恢復" },
      { id: "rpe-3-4", range: "3–4", label: "輕鬆", feel: "舒適、穩定、可控制", talkTest: "可以說完整句子", training: "輕鬆跑、恢復跑、跑走交替" },
      { id: "rpe-5-6", range: "5–6", label: "穩態", feel: "需要專注，但可以持續", talkTest: "可以說短句", training: "穩態跑、受控長跑" },
      { id: "rpe-7-8", range: "7–8", label: "較難", feel: "需要高度專注，仍能按計畫重複", talkTest: "只能說短語或幾個詞", training: "節奏跑、較長間歇、5K 強度" },
      { id: "rpe-9", range: "9", label: "非常難", feel: "接近最大，只能短時間維持", talkTest: "只能說一兩個詞", training: "短間歇、比賽後段" },
      { id: "rpe-10", range: "10", label: "最大努力", feel: "全力輸出，充分恢復前無法重複", talkTest: "無法說話", training: "短衝刺、終點衝刺" },
    ],
    scaleCaution: "這些是便於執行的體感線索，不是精確生理換算。RPE 無法對所有人一一對應到固定配速、最大心率百分比、乳酸值或訓練區間。",
    plansTitle: "三個官方 5K 計畫如何使用 RPE",
    plansIntro: "初學者減少強度決策，具備可靠基線後才逐步加入品質訓練。",
    plans: [
      { title: "零基礎第一個 5K", range: "以 RPE 3–4 為主", description: "跑走訓練保持可以交談，再逐步延長跑步段；不需要編造目標配速。", href: sharedPlanHrefs.first },
      { title: "穩定完成 5K", range: "RPE 3–6", description: "輕鬆跑和長跑保持 RPE 3–4，受控穩態訓練提高到 RPE 5–6。", href: sharedPlanHrefs.finish },
      { title: "提升 5K 表現", range: "RPE 3–9", description: "輕鬆日保持輕鬆，節奏、間歇和 5K 專項達到 RPE 6–9。", href: sharedPlanHrefs.improve },
    ],
    compareTitle: "RPE、配速和心率應該看哪個？",
    compareIntro: "三個指標回答不同問題。可靠計畫會選擇最少但可信的指標。",
    comparisons: [
      { title: "RPE", strength: "不需裝置，能立即反映炎熱、坡度、疲勞和睡眠。", limitation: "需要練習並保持相同量表定義。" },
      { title: "配速", strength: "近期成績提供可靠錨點時，目標具體且容易核對。", limitation: "地形、天氣、海拔與 GPS 誤差會改變代價。" },
      { title: "心率", strength: "可觀察心血管內部反應，適合檢視有氧趨勢。", limitation: "短間歇存在延遲，也受裝置、炎熱、補水與壓力影響。" },
    ],
    compareConclusion: "有可靠近期成績時，可用配速指導品質課、以 RPE 檢查當天代價；沒有錨點時，RPE 和談話測試比編造配速更穩妥。",
    coachTitle: "Trainingload.ai 的 AI 教練如何使用 RPE",
    coachParagraphs: ["官方範本先由模型生成候選，再經結構校驗、審核與凍結。使用者開啟或建立範本時，模型不會重新改寫 Workout，RPE 與日程是穩定版本。", "AI 客製計畫可讀取使用者授權的運動基線。沒有可靠近期 5K 成績時以 RPE 為主；基線可靠時可增加配速目標，同時保留 RPE 檢查當天狀態。"],
    coachSteps: [
      { title: "讀取運動基線", description: "使用跑步歷史、連續跑能力、可訓練日與可靠近期成績。" },
      { title: "選擇強度錨點", description: "證據稀疏時使用 RPE；資料足夠才加入配速或 VDOT。" },
      { title: "保持訓練可執行", description: "每個步驟保留目的、體感提示、恢復要求與可理解的假設。" },
    ],
    meaningsTitle: "不要混淆三種 RPE",
    meaningsIntro: "這個縮寫出現在耐力計畫、訓練負荷與力量訓練中，但回答的問題不同。",
    meanings: [
      { title: "Workout 步驟 RPE", description: "目前跑步訓練段應有多難。5K 日曆裡的 RPE 3–4 指的就是這個。" },
      { title: "Session RPE", description: "整次訓練完成後的總體難度，可結合時長估算內部訓練負荷。", href: "/training-load" },
      { title: "力量訓練 Set RPE", description: "一組動作距離力竭有多近，常結合剩餘重複次數解釋，不能直接套用到跑步間歇。", href: "/docs/planning/strength-workout-dsl" },
    ],
    calibrateTitle: "用前兩到三週校準自己的 RPE",
    calibrateIntro: "持續使用相同量表後，判斷會越來越穩定。",
    calibrateSteps: ["看手錶前先說出體感等級，再檢查能否達到對應談話程度。", "間歇訓練評價工作段，不要用組間恢復的感覺代替。", "訓練後另記整節 Session RPE，不要直接複製最難的一刻。", "連續數週比較相似路線與條件。"],
    mistakesTitle: "常見 RPE 錯誤",
    mistakes: ["因為叫輕鬆跑，就把所有輕鬆跑評為 RPE 1–2。", "因手錶配速看起來太慢，讓輕鬆日跑到 RPE 6。", "把 RPE 當成心率、配速或功率的精確換算表。", "只評價腿部不適或只看呼吸。", "把力量訓練 RPE/RIR 直接用於整次跑步。", "把 RPE 10 當成日常目標。"],
    faqTitle: "常見問題",
    faq: [
      ["RPE 是什麼意思？", "RPE 是 Rating of Perceived Exertion，即主觀用力程度評分，綜合呼吸、肌肉負擔與整體努力感表示運動有多難。"],
      ["跑步 RPE 3–4 是什麼感覺？", "應該輕鬆、穩定、可控制，可以說完整句子，呼吸比靜息明顯但不緊張。"],
      ["輕鬆跑應保持多少 RPE？", "這些計畫中的輕鬆與恢復跑多為 RPE 3–4。天氣、坡度與疲勞會改變配速，但體感目標不變。"],
      ["5K 比賽通常是多少 RPE？", "許多跑者會從較難但可控逐步提高到終點附近的非常難，約 RPE 7–9；只求完賽的初學者可刻意保持更低。"],
      ["沒有心率錶，可以只用 RPE 訓練嗎？", "可以。RPE 配合談話測試足以指導有效強度；心率只是一個額外訊號，不能取代判斷。"],
      ["為什麼同樣配速每天 RPE 不同？", "炎熱、風、坡度、睡眠、補水、壓力、身體狀況與累積疲勞都會改變同一配速的代價。"],
      ["RPE 能直接換算心率區間或配速嗎？", "不能精確換算。個人能力、環境、運動類型與測量方法都會改變彼此關係。"],
      ["跑步 RPE 和力量訓練 RPE/RIR 有何差異？", "跑步 RPE 描述一段或整次運動的主觀強度；力量 RPE 常與力竭前剩餘次數相關，因此同一數字含義不完全相同。"],
      ["何時應減速或停止？", "無法維持計畫的談話或體感提示時先減速；胸痛、暈厥、異常呼吸困難或持續加重的疼痛時應停止並尋求專業醫療協助。"],
      ["初學者多久能學會判斷 RPE？", "多數跑者連續兩到三週評價相似訓練後會更穩定。請使用相同量表和記錄時機。"],
    ],
    sourcesTitle: "資料來源與適用範圍",
    sourceNote: "本指南依據主觀用力程度研究與公開運動強度指南，再轉化為 Trainingload.ai 計畫使用的 1–10 分語言。",
    safety: "本頁是訓練教育內容，不構成醫療建議。出現胸痛、暈厥、異常呼吸困難，或持續、加重的疼痛時，請停止訓練並尋求專業醫療協助。",
    relatedTitle: "把 RPE 強度表用到計畫中",
    related: [["零基礎第一個 5K", sharedPlanHrefs.first, "從 RPE 3–4、可以交談的跑走訓練開始。"], ["穩定完成 5K", sharedPlanHrefs.finish, "用輕鬆與穩態強度建立完整 5K 能力。"], ["提升 5K 表現", sharedPlanHrefs.improve, "把 RPE 與節奏、間歇及可選 VDOT 配速結合。"], ["VDOT 計算器", "/vdot-calculator", "有可靠表現錨點時再加入配速目標。"], ["訓練負荷", "/training-load", "理解 Session RPE 與 Workout 步驟 RPE 的差異。"]],
    homeLabel: "首頁",
    scheduleGuideLabel: "不熟悉 RPE？先看 RPE 1–10 主觀強度表。",
    intensityLinkLabel: "開啟 RPE 主觀強度指南",
  },
};

export function isRpeScaleContentLocale(locale: string) {
  return (RPE_SCALE_CONTENT_LOCALES as readonly string[]).includes(locale);
}

export function getRpeScaleContent(locale: string): RpeScaleContent {
  if (locale === "zh-hant") return content["zh-hant"];
  if (locale === "zh") return content.zh;
  if (locale === "ja") return content.ja;
  return content.en;
}
