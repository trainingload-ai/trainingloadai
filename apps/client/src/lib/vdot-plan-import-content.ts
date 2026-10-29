const en = {
  eyebrow: "VDOT plan import",
  title: "Review your generated plan",
  subtitle:
    "Nothing is active yet. Confirm the structure below to create an editable draft in Trainingload.ai.",
  loading: "Loading your plan…",
  errorTitle: "This import link is unavailable",
  errorText: "It may have expired, already been used, or become invalid.",
  retry: "Try again",
  back: "Back to plans",
  summary: "Plan summary",
  vdot: "Current VDOT",
  weeks: "Weeks",
  workouts: "Workouts",
  starts: "Starts",
  generated: "Generated",
  paces: "Training paces",
  schedule: "Weekly schedule",
  week: "Week",
  confirm: "Create draft plan",
  confirming: "Creating draft…",
  cancel: "Cancel",
  warning: "Plan notes",
  disclosure:
    "Training intensities reference VDOT and E/M/T/I/R concepts. This is a Trainingload.ai-generated plan, not an official Jack Daniels or VDOT O2 plan.",
  draftNote:
    "Confirming creates a DRAFT. You can review or edit it before choosing a start date and activating it.",
  importError: "The draft could not be created. Please try again.",
  zones: {
    E: "Easy",
    M: "Marathon",
    T: "Threshold",
    I: "Interval",
    R: "Repetition",
  },
  weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

const zh = {
  eyebrow: "VDOT 计划导入",
  title: "确认生成的训练计划",
  subtitle:
    "当前还没有激活任何内容。确认下方结构后，系统才会在 Trainingload.ai 中创建一份可编辑草稿。",
  loading: "正在读取训练计划…",
  errorTitle: "这个导入链接已不可用",
  errorText: "链接可能已经过期、使用过或内容无效。",
  retry: "重试",
  back: "返回计划",
  summary: "计划摘要",
  vdot: "当前 VDOT",
  weeks: "周数",
  workouts: "Workout 数量",
  starts: "开始日期",
  generated: "生成时间",
  paces: "训练配速",
  schedule: "逐周安排",
  week: "第",
  confirm: "创建草稿计划",
  confirming: "正在创建草稿…",
  cancel: "取消",
  warning: "计划提示",
  disclosure:
    "训练强度参考 VDOT 与 E/M/T/I/R 理念。这是 Trainingload.ai 自有规则生成的计划，不是 Jack Daniels 或 VDOT O2 官方计划。",
  draftNote:
    "确认后只会创建 DRAFT 草稿。你仍可检查、编辑，并自行选择开始日期和激活时间。",
  importError: "暂时无法创建草稿，请重试。",
  zones: {
    E: "轻松跑",
    M: "马拉松配速",
    T: "乳酸阈值",
    I: "间歇跑",
    R: "重复跑",
  },
  weekdays: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
};

export function getVdotPlanImportCopy(locale: string) {
  if (locale === "zh-hant") {
    return {
      ...zh,
      title: "確認產生的訓練計畫",
      confirm: "建立草稿計畫",
      confirming: "正在建立草稿…",
      cancel: "取消",
      disclosure:
        "訓練強度參考 VDOT 與 E/M/T/I/R 理念。這是 Trainingload.ai 自有規則產生的計畫，不是 Jack Daniels 或 VDOT O2 官方計畫。",
    };
  }
  return locale.startsWith("zh") ? zh : en;
}
