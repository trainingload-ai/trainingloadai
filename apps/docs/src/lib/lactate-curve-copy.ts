import type {
  LactateMethodId,
  LactateReason,
} from "@trainingloadai/shared/lactate-analysis";

import {
  getLactatePresentationCopy,
  type LactatePresentationCopy,
} from "./lactate-presentation-copy";

export type LactateCopy = BaseLactateCopy & {
  presentation: LactatePresentationCopy;
};
type BaseLactateCopy = {
  title: string;
  description: string;
  badge: string;
  privacy: string;
  inputTitle: string;
  resultTitle: string;
  empty: string;
  stale: string;
  sample: string;
  cycling: string;
  running: string;
  intensity: string;
  lactate: string;
  heartRate: string;
  stage: string;
  rest: string;
  example: string;
  clear: string;
  add: string;
  remove: string;
  analyze: string;
  calculating: string;
  paste: string;
  import: string;
  template: string;
  confirmImport: string;
  cancel: string;
  mapping: string;
  noColumn: string;
  sort: string;
  overwrite: string;
  resetSport: string;
  pasteHelp: string;
  inputHelp: string;
  method: string;
  threshold: string;
  selected: string;
  unavailable: string;
  partial: string;
  noResult: string;
  lt1: string;
  lt2: string;
  zones: string;
  zoneNames: [string, string, string];
  methodHelp: string;
  export: string;
  print: string;
  report: string;
  source: string;
  copied: string;
  copy: string;
  quality: string;
  methodsTitle: string;
  instructionsTitle: string;
  instructions: string[];
  faqTitle: string;
  faq: { question: string; answer: string }[];
  alternative: string;
  alternativeBody: string;
  related: string;
  cta: string;
  ctaBody: string;
  protocol: string;
  stageMinutes: string;
  sampleSite: string;
  notRecorded: string;
  earlobe: string;
  fingertip: string;
  other: string;
  incomplete: string;
  excluded: string;
  runtimeError: string;
  exportError: string;
  recordingError: string;
  methodNames: Record<LactateMethodId, string>;
  methodDescriptions: Record<LactateMethodId, string>;
  reasons: Record<LactateReason, string>;
};

const methodNames = {
  obla_2: "OBLA 2.0",
  obla_4: "OBLA 4.0",
  bsln_05: "Bsln + 0.5",
  bsln_10: "Bsln + 1.0",
  log_log: "Log-log",
  dmax: "Dmax",
  moddmax: "ModDmax",
  log_poly_moddmax: "Log-Poly-ModDmax",
};

const en: BaseLactateCopy = {
  title: "Lactate Curve Calculator",
  description:
    "Analyze measured blood lactate from incremental cycling or running tests. Compare threshold methods, define intensity domains and export the analysis.",
  badge: "Incremental step testing",
  privacy:
    "Free, no sign-up. Test data stays in this browser tab and is lost on refresh unless exported.",
  inputTitle: "Your test data",
  resultTitle: "Test analysis",
  empty:
    "Enter your stage data or load an example to see how the analysis works.",
  stale:
    "Your inputs have changed. Analyze again before using or exporting these results.",
  sample: "Illustrative example — not your test data",
  cycling: "Cycling",
  running: "Running",
  intensity: "Intensity",
  lactate: "Lactate",
  heartRate: "Heart rate",
  stage: "Stage",
  rest: "Use 0 for a resting sample",
  example: "Load example",
  clear: "Clear data",
  add: "Add stage",
  remove: "Remove stage",
  analyze: "Analyze data",
  calculating: "Analyzing…",
  paste: "Paste a table",
  import: "Import CSV",
  template: "Download CSV template",
  confirmImport: "Use these columns",
  cancel: "Cancel",
  mapping: "Check columns and units",
  noColumn: "Not recorded",
  sort: "Sort stages by intensity",
  overwrite: "Replace the current stage data?",
  resetSport: "Changing sport clears the current data. Continue?",
  pasteHelp:
    "Paste comma- or tab-separated rows. Decimal point: “.”. Confirm the column mapping before replacing data.",
  inputHelp:
    "Enter 4–30 exercise stages; 6–10 are preferable. Lactate: mmol/L. Heart rate is optional. Each row must be complete; 0 marks an optional resting sample.",
  method: "Method",
  threshold: "Threshold",
  selected: "Method shown on chart",
  unavailable: "Not available",
  partial:
    "Some methods could not find a threshold. Available results are shown below.",
  noResult:
    "No applicable threshold was found. Review the stage data and method notes; results are not extrapolated beyond the test.",
  lt1: "First threshold (LT1)",
  lt2: "Second threshold (LT2)",
  zones: "Three intensity zones",
  zoneNames: ["Below LT1", "LT1 to LT2", "Above LT2"],
  methodHelp:
    "Method choices change the boundaries. Lactate thresholds are estimates; they are not automatically equivalent to FTP.",
  export: "Download results CSV",
  print: "Print report",
  report: "Lactate test report",
  source: "Calculation reference",
  copied: "Copied",
  copy: "Copy results",
  quality: "Data quality notes",
  methodsTitle: "Methods and applicability",
  instructionsTitle: "Data requirements and workflow",
  instructions: [
    "Record intensity and measured blood lactate at the end of each step. Optional heart rates must belong to the same stages.",
    "Choose the sport and the units used in your recording, then enter, paste or import the rows.",
    "Inspect the curve and warnings, compare the methods, then export the chosen interpretation. Repeat tests with a comparable protocol.",
  ],
  faqTitle: "Questions about lactate test analysis",
  faq: [
    {
      question: "Can I use Garmin data without blood lactate samples?",
      answer:
        "This tool needs measured lactate at each stage. For an estimate from race results or a field test, use the separate lactate threshold calculator.",
    },
    {
      question: "Why do the methods return different numbers?",
      answer:
        "Fixed concentrations, baseline rises and curve geometry describe different features. Some methods target the first rise; others estimate a higher boundary. Agreement does not prove physiological accuracy.",
    },
    {
      question: "Are LT1 and LT2 a diagnosis or a training prescription?",
      answer:
        "They are method-dependent intensity references. Stage duration, sampling and day-to-day variation affect interpretation. Keep the method and protocol with the result; a qualified coach can help apply it.",
    },
    {
      question: "What happens to my test data?",
      answer:
        "Calculation, CSV parsing and report generation run locally. Inputs are not uploaded or placed in the URL. Refreshing the tab clears them; download a report if you need a record.",
    },
  ],
  alternative: "No measured lactate samples?",
  alternativeBody:
    "Estimate a training reference from a race or field test with our lactate threshold calculator.",
  related: "Related tools",
  cta: "Track training load and recovery over time",
  ctaBody:
    "Combine daily training records, intensity distribution and condition trends to plan your training cycle and put future tests in context.",
  protocol: "Optional test information",
  stageMinutes: "Minutes per stage",
  sampleSite: "Blood sampling site",
  notRecorded: "Not recorded",
  earlobe: "Earlobe",
  fingertip: "Fingertip",
  other: "Other",
  incomplete: "The last stage was not completed",
  excluded: "Exclude the last stage from analysis",
  runtimeError:
    "The analysis could not run. Your inputs are still here; please try again.",
  exportError: "The export could not be prepared. Please try again.",
  recordingError:
    "Check the file, rows, numeric values and column mapping. CSV limit: 256 KiB, 100 text lines, 16 columns.",
  methodNames,
  methodDescriptions: {
    obla_2:
      "Intensity where the fitted cubic last rises through 2 mmol/L. A fixed concentration is not everyone’s first threshold.",
    obla_4:
      "Intensity where the fitted cubic last rises through 4 mmol/L. This fixed marker is not universally LT2.",
    bsln_05:
      "Intensity at baseline plus 0.5 mmol/L. Baseline is the resting sample, or the first exercise stage when no resting sample was recorded.",
    bsln_10:
      "Intensity at baseline plus 1.0 mmol/L. A single baseline sample can move this estimate.",
    log_log:
      "Two straight lines fitted to log intensity and log lactate, sharing a measured division stage. The minimum-residual split determines their intersection. At least five stages are needed.",
    dmax: "Greatest distance below the line joining the fitted cubic’s first and last points. Only exercise stages are fitted.",
    moddmax:
      "The reference line starts before the first adjacent lactate rise of at least 0.4 mmol/L, using observed anchor values.",
    log_poly_moddmax:
      "The reference line runs from the Log-log intensity on the cubic to the last measured lactate point. It depends on a valid Log-log result.",
  },
  reasons: {
    invalid_value:
      "Check the highlighted row. Use finite, positive lactate and optional heart-rate values; intensity may be 0 only for rest.",
    too_few_stages:
      "At least four exercise stages are needed; Log-log needs five.",
    too_many_stages: "Use at most 30 exercise stages.",
    duplicate_intensity:
      "Each intensity must occur only once. Review duplicate stages.",
    unsorted_stages:
      "Stage intensities must increase. Confirm sorting before analysis.",
    fit_degenerate: "These stages do not determine a stable cubic fit.",
    target_not_reached:
      "The fitted curve does not rise through this target within the tested range.",
    loglog_unavailable:
      "No valid Log-log intersection was found within the exercise stages.",
    no_lactate_rise: "No adjacent rise of at least 0.4 mmol/L was found.",
    no_distance: "No positive distance below the reference line was found.",
    no_resting_sample:
      "No resting sample: baseline-rise methods use the first exercise stage.",
    few_stages: "Few stages: a single sample may strongly affect the fit.",
    early_dip:
      "Lactate falls in the early stages. Check the samples and warm-up context.",
    final_not_rising:
      "Lactate does not increase at the final stage. Check whether the test reached the intended intensity.",
    uneven_steps:
      "Intensity increments vary. Keep the test protocol with this result.",
    threshold_at_edge: "This estimate lies at an edge of the measured range.",
    negative_fit:
      "The fitted curve dips below zero. Inspect fit quality and sample values.",
    invalid_pair:
      "Choose available methods with LT1 below LT2 before using the zones.",
  },
};

const zh: BaseLactateCopy = {
  title: "乳酸曲线分析工具",
  description:
    "分析骑行或跑步阶梯负荷测试的实测血乳酸数据，比较阈值判定方法，生成强度分区与测试报告。",
  badge: "阶梯负荷测试",
  privacy:
    "免费，无需注册。测试数据仅保留在当前浏览器标签页，刷新前请按需导出。",
  inputTitle: "测试数据",
  resultTitle: "分析结果",
  empty: "输入各阶段数据，或加载示例了解分析过程。",
  stale: "输入已修改，请重新分析后再使用或导出结果。",
  sample: "教学示例，并非你的测试数据",
  cycling: "骑行",
  running: "跑步",
  intensity: "强度",
  lactate: "乳酸",
  heartRate: "心率",
  stage: "阶段",
  rest: "静息样本的强度填 0",
  example: "加载示例",
  clear: "清空数据",
  add: "添加阶段",
  remove: "移除阶段",
  analyze: "分析数据",
  calculating: "正在分析…",
  paste: "粘贴表格",
  import: "导入 CSV",
  template: "下载 CSV 模板",
  confirmImport: "确认使用这些列",
  cancel: "取消",
  mapping: "确认列和单位",
  noColumn: "未记录",
  sort: "按强度排序阶段",
  overwrite: "替换当前阶段数据？",
  resetSport: "切换运动会清空当前数据，是否继续？",
  pasteHelp:
    "粘贴逗号或制表符分隔的数据，小数点使用“.”。替换数据前请确认列映射。",
  inputHelp:
    "输入 4–30 个运动阶段，建议 6–10 个。乳酸单位为 mmol/L，心率可留空。每行必填数据需完整；可另加一行强度为 0 的静息样本。",
  method: "方法",
  threshold: "阈值",
  selected: "图中显示的方法",
  unavailable: "不可用",
  partial: "部分方法未找到阈值，以下保留可用结果。",
  noResult:
    "未找到可用阈值。请检查阶段数据和方法说明；不会向测试范围外推测结果。",
  lt1: "第一乳酸阈值 LT1",
  lt2: "第二乳酸阈值 LT2",
  zones: "三个强度区间",
  zoneNames: ["低于 LT1", "LT1 至 LT2", "高于 LT2"],
  methodHelp:
    "方法选择会改变分界。乳酸阈值是估计的强度参考，不能直接当作 FTP。",
  export: "下载结果 CSV",
  print: "打印报告",
  report: "乳酸测试报告",
  source: "计算参考",
  copied: "已复制",
  copy: "复制结果",
  quality: "数据质量提示",
  methodsTitle: "计算方法与适用条件",
  instructionsTitle: "数据要求与使用流程",
  instructions: [
    "在每档结束时记录运动强度和实测血乳酸。可选心率应与对应阶段一致。",
    "选择运动和记录时使用的单位，再手动录入、粘贴或导入数据。",
    "检查曲线和提示，比较不同方法后导出。复测时尽量使用一致的测试方案。",
  ],
  faqTitle: "乳酸测试分析常见问题",
  faq: [
    {
      question: "只有 Garmin 活动数据，没有采血结果，能用吗？",
      answer:
        "这里需要每档实测乳酸。如果希望根据比赛成绩或场地测试估算训练参考，请使用另一个乳酸阈值计算器。",
    },
    {
      question: "为什么不同方法算出的数值不同？",
      answer:
        "固定浓度、基线增量和曲线几何研究的是不同特征。有些方法寻找第一处上升，有些估计较高强度的分界；数值接近也不能证明生理上准确。",
    },
    {
      question: "LT1、LT2 是诊断或训练处方吗？",
      answer:
        "它们是依赖计算方法的强度参考。每档时长、采样方式和跨日波动都会影响解读。请同时保存方法和测试方案，需要时由有经验的教练协助应用。",
    },
    {
      question: "测试数据会被保存在哪里？",
      answer:
        "计算、CSV 解析和报告生成都在本地完成，输入不会上传或写进网址。刷新后数据清空，需要留档时请下载报告。",
    },
  ],
  alternative: "没有实测乳酸数据？",
  alternativeBody: "可用乳酸阈值计算器，根据比赛或场地测试估算训练强度参考。",
  related: "相关工具",
  cta: "持续追踪训练负荷与恢复趋势",
  ctaBody:
    "结合日常训练记录、强度分布与状态趋势，安排训练周期，并为下一次测试提供对照。",
  protocol: "可选测试信息",
  stageMinutes: "每档时长（分钟）",
  sampleSite: "采血位置",
  notRecorded: "未记录",
  earlobe: "耳垂",
  fingertip: "指尖",
  other: "其他",
  incomplete: "最后一档未完成",
  excluded: "从分析中排除最后一档",
  runtimeError: "分析暂时无法运行，输入仍然保留，请重试。",
  exportError: "未能准备好导出内容，请重试。",
  recordingError:
    "请检查文件、行、数值和列映射。CSV 限制为 256 KiB、100 行文本、16 列。",
  methodNames,
  methodDescriptions: {
    obla_2:
      "三次拟合曲线最后一次向上穿过 2 mmol/L 时的强度。固定浓度并不一定是每个人的第一阈值。",
    obla_4:
      "三次拟合曲线最后一次向上穿过 4 mmol/L 时的强度，不能统一当作每个人的 LT2。",
    bsln_05:
      "拟合曲线达到基线加 0.5 mmol/L 时的强度。基线优先取静息样本，否则取首个运动阶段。",
    bsln_10:
      "拟合曲线达到基线加 1.0 mmol/L 时的强度，单个基线样本可能影响结果。",
    log_log:
      "对强度和乳酸取对数后，拟合共享分割阶段的两条直线，选残差最小的分割并求交点，至少需要五档。",
    dmax: "三次曲线位于其首末拟合点连线下方、距离最大的位置，只拟合运动阶段。",
    moddmax:
      "从首次相邻乳酸上升至少 0.4 mmol/L 之前的阶段，到末档观测点作连线，再求曲线的最大距离。",
    log_poly_moddmax:
      "连线起于 Log-log 强度在三次曲线上的位置，止于最后一个实测乳酸点，因此需要有效的 Log-log 结果。",
  },
  reasons: {
    invalid_value:
      "请检查对应行。乳酸和可选心率需为有限正数，只有静息样本的强度可以为 0。",
    too_few_stages: "至少需要四个运动阶段；Log-log 需要五个。",
    too_many_stages: "最多支持 30 个运动阶段。",
    duplicate_intensity: "每个强度只能出现一次，请检查重复阶段。",
    unsorted_stages: "阶段强度需递增，请先确认排序。",
    fit_degenerate: "这些阶段无法确定稳定的三次拟合曲线。",
    target_not_reached: "曲线未在测试范围内向上穿过此目标浓度。",
    loglog_unavailable: "未在运动阶段范围内找到有效的 Log-log 交点。",
    no_lactate_rise: "未找到相邻阶段至少上升 0.4 mmol/L 的位置。",
    no_distance: "未找到曲线位于参考连线下方的有效距离点。",
    no_resting_sample: "没有静息样本，基线增量方法使用首个运动阶段。",
    few_stages: "阶段较少，单个样本可能明显影响拟合。",
    early_dip: "前几档乳酸有所下降，请结合样本和热身情况检查。",
    final_not_rising: "末档乳酸未继续上升，请检查测试是否达到预定强度。",
    uneven_steps: "阶段强度增幅不一致，请连同测试方案解读。",
    threshold_at_edge: "这个估计值位于实测范围的边缘。",
    negative_fit: "拟合曲线出现负值，请检查拟合及样本。",
    invalid_pair: "请选用有效的方法，并确保 LT1 低于 LT2 后再使用区间。",
  },
};

const zhHant: BaseLactateCopy = {
  title: "乳酸曲線分析工具",
  description:
    "分析騎行或跑步階梯負荷測試的實測血乳酸資料，比較閾值判定方法，產生強度區間與測試報告。",
  badge: "階梯負荷測試",
  privacy:
    "免費，無需註冊。測試資料僅保留於目前瀏覽器分頁，重新整理前請依需要匯出。",
  inputTitle: "測試資料",
  resultTitle: "分析結果",
  empty: "輸入各階段資料，或載入範例了解分析過程。",
  stale: "輸入已修改，請重新分析後再使用或匯出結果。",
  sample: "教學範例，並非你的測試資料",
  cycling: "自行車",
  running: "跑步",
  intensity: "強度",
  lactate: "乳酸",
  heartRate: "心率",
  stage: "階段",
  rest: "靜息樣本的強度填 0",
  example: "載入範例",
  clear: "清空資料",
  add: "新增階段",
  remove: "移除階段",
  analyze: "分析資料",
  calculating: "正在分析…",
  paste: "貼上表格",
  import: "匯入 CSV",
  template: "下載 CSV 範本",
  confirmImport: "確認使用這些欄位",
  cancel: "取消",
  mapping: "確認欄位與單位",
  noColumn: "未記錄",
  sort: "依強度排序階段",
  overwrite: "取代目前的階段資料？",
  resetSport: "切換運動會清空目前資料，是否繼續？",
  pasteHelp:
    "貼上逗號或定位字元分隔的資料，小數點使用「.」。取代資料前請確認欄位對應。",
  inputHelp:
    "輸入 4–30 個運動階段，建議 6–10 個。乳酸單位為 mmol/L，心率可留空。每列必填資料需完整；可另加一列強度為 0 的靜息樣本。",
  method: "方法",
  threshold: "閾值",
  selected: "圖中顯示的方法",
  unavailable: "無法計算",
  partial: "部分方法未找到閾值，以下保留可用結果。",
  noResult:
    "未找到可用閾值。請檢查階段資料與方法說明；不會推測測試範圍以外的結果。",
  lt1: "第一乳酸閾值 LT1",
  lt2: "第二乳酸閾值 LT2",
  zones: "三個強度區間",
  zoneNames: ["低於 LT1", "LT1 至 LT2", "高於 LT2"],
  methodHelp:
    "方法選擇會改變分界。乳酸閾值是估計的強度參考，不能直接當作 FTP。",
  export: "下載結果 CSV",
  print: "列印報告",
  report: "乳酸測試報告",
  source: "計算參考",
  copied: "已複製",
  copy: "複製結果",
  quality: "資料品質提示",
  methodsTitle: "計算方法與適用條件",
  instructionsTitle: "資料要求與操作流程",
  instructions: [
    "在每個階段結束時記錄運動強度和實測血乳酸。選填心率應與對應階段一致。",
    "選擇運動和記錄時使用的單位，再手動輸入、貼上或匯入資料。",
    "檢查曲線和提示，比較不同方法後匯出。複測時盡量使用一致的測試方案。",
  ],
  faqTitle: "乳酸測試分析常見問題",
  faq: [
    {
      question: "只有 Garmin 活動資料，沒有採血結果，可以使用嗎？",
      answer:
        "這裡需要每個階段的實測乳酸。若希望依比賽成績或場地測試估算訓練參考，請使用另一個乳酸閾值計算器。",
    },
    {
      question: "為什麼不同方法算出的數值不同？",
      answer:
        "固定濃度、基線增量與曲線幾何研究的是不同特徵。有些方法尋找第一處上升，有些估計較高強度的分界；數值接近也不能證明生理上準確。",
    },
    {
      question: "LT1、LT2 是診斷或訓練處方嗎？",
      answer:
        "它們是依賴計算方法的強度參考。每個階段的時間、採樣方式和跨日波動都會影響解讀。請同時保存方法與測試方案，需要時由有經驗的教練協助應用。",
    },
    {
      question: "測試資料會儲存在哪裡？",
      answer:
        "計算、CSV 解析與報告產生都在本機完成，輸入不會上傳或寫入網址。重新整理後資料清空，需要留存時請下載報告。",
    },
  ],
  alternative: "沒有實測乳酸資料？",
  alternativeBody: "可用乳酸閾值計算器，依比賽或場地測試估算訓練強度參考。",
  related: "相關工具",
  cta: "持續追蹤訓練負荷與恢復趨勢",
  ctaBody:
    "結合日常訓練記錄、強度分布與狀態趨勢，安排訓練週期，並為下一次測試提供對照。",
  protocol: "選填測試資訊",
  stageMinutes: "每個階段的時間（分鐘）",
  sampleSite: "採血位置",
  notRecorded: "未記錄",
  earlobe: "耳垂",
  fingertip: "指尖",
  other: "其他",
  incomplete: "最後一個階段未完成",
  excluded: "從分析中排除最後一個階段",
  runtimeError: "分析暫時無法執行，輸入仍然保留，請重試。",
  exportError: "未能準備好匯出內容，請重試。",
  recordingError:
    "請檢查檔案、列、數值和欄位對應。CSV 限制為 256 KiB、100 行文字、16 欄。",
  methodNames,
  methodDescriptions: {
    obla_2:
      "三次擬合曲線最後一次向上穿過 2 mmol/L 時的強度。固定濃度不一定是每個人的第一閾值。",
    obla_4:
      "三次擬合曲線最後一次向上穿過 4 mmol/L 時的強度，不能統一當作每個人的 LT2。",
    bsln_05:
      "擬合曲線達到基線加 0.5 mmol/L 時的強度。基線優先採用靜息樣本，否則採用第一個運動階段。",
    bsln_10:
      "擬合曲線達到基線加 1.0 mmol/L 時的強度，單個基線樣本可能影響結果。",
    log_log:
      "對強度與乳酸取對數後，擬合共用分割階段的兩條直線，選殘差最小的分割並求交點，至少需要五個階段。",
    dmax: "三次曲線位於其首末擬合點連線下方、距離最大的位置，只擬合運動階段。",
    moddmax:
      "從首次相鄰乳酸上升至少 0.4 mmol/L 之前的階段，到末階段觀測點作連線，再求曲線的最大距離。",
    log_poly_moddmax:
      "連線起於 Log-log 強度在三次曲線上的位置，止於最後一個實測乳酸點，因此需要有效的 Log-log 結果。",
  },
  reasons: {
    invalid_value:
      "請檢查對應列。乳酸和選填心率需為有限正數，只有靜息樣本的強度可以為 0。",
    too_few_stages: "至少需要四個運動階段；Log-log 需要五個。",
    too_many_stages: "最多支援 30 個運動階段。",
    duplicate_intensity: "每個強度只能出現一次，請檢查重複階段。",
    unsorted_stages: "階段強度需遞增，請先確認排序。",
    fit_degenerate: "這些階段無法確定穩定的三次擬合曲線。",
    target_not_reached: "曲線未在測試範圍內向上穿過此目標濃度。",
    loglog_unavailable: "未在運動階段範圍內找到有效的 Log-log 交點。",
    no_lactate_rise: "未找到相鄰階段至少上升 0.4 mmol/L 的位置。",
    no_distance: "未找到曲線位於參考連線下方的有效距離點。",
    no_resting_sample: "沒有靜息樣本，基線增量方法使用第一個運動階段。",
    few_stages: "階段較少，單個樣本可能明顯影響擬合。",
    early_dip: "前幾個階段乳酸有所下降，請結合樣本與熱身情況檢查。",
    final_not_rising: "末階段乳酸未繼續上升，請檢查測試是否達到預定強度。",
    uneven_steps: "階段強度增幅不一致，請連同測試方案解讀。",
    threshold_at_edge: "這個估計值位於實測範圍的邊緣。",
    negative_fit: "擬合曲線出現負值，請檢查擬合與樣本。",
    invalid_pair: "請選用有效的方法，並確保 LT1 低於 LT2 後再使用區間。",
  },
};

const ja: BaseLactateCopy = {
  title: "乳酸カーブ計算ツール",
  description:
    "自転車・ランニングの段階負荷テストで得られた血中乳酸データを分析。閾値算出法を比較し、強度ゾーンとレポートを作成します。",
  badge: "段階負荷テスト",
  privacy:
    "無料・登録不要。データはこのタブ内だけで処理されます。再読み込みする前に必要な結果を出力してください。",
  inputTitle: "テストデータ",
  resultTitle: "分析結果",
  empty:
    "各ステージのデータを入力するか、サンプルで分析の流れを確認してください。",
  stale:
    "入力が変更されました。結果の利用・出力前に、もう一度分析してください。",
  sample: "説明用サンプルです。あなたの測定データではありません。",
  cycling: "自転車",
  running: "ランニング",
  intensity: "強度",
  lactate: "乳酸",
  heartRate: "心拍数",
  stage: "ステージ",
  rest: "安静時のサンプルは強度を 0 に設定",
  example: "サンプルを読み込む",
  clear: "データを消去",
  add: "ステージを追加",
  remove: "ステージを削除",
  analyze: "データを分析",
  calculating: "分析中…",
  paste: "表を貼り付ける",
  import: "CSV を読み込む",
  template: "CSV テンプレート",
  confirmImport: "この列を使用",
  cancel: "キャンセル",
  mapping: "列と単位を確認",
  noColumn: "記録なし",
  sort: "強度順に並べ替える",
  overwrite: "現在のステージデータを置き換えますか？",
  resetSport: "種目を変更すると現在のデータが消去されます。続行しますか？",
  pasteHelp:
    "カンマまたはタブ区切りの行を貼り付けます。小数点は「.」を使用してください。置き換える前に列の対応を確認します。",
  inputHelp:
    "運動ステージは 4〜30 段階（推奨 6〜10）。乳酸の単位は mmol/L、心拍数は任意です。必須セルはすべて入力してください。安静時のサンプルを強度 0 で追加できます。",
  method: "算出方法",
  threshold: "閾値",
  selected: "グラフに表示する方法",
  unavailable: "算出できません",
  partial:
    "一部の方法では閾値を算出できませんでした。算出できた結果を表示します。",
  noResult:
    "有効な閾値が見つかりませんでした。入力と方法の説明を確認してください。測定範囲の外側には外挿しません。",
  lt1: "第1乳酸閾値 LT1",
  lt2: "第2乳酸閾値 LT2",
  zones: "3つの強度ゾーン",
  zoneNames: ["LT1 未満", "LT1〜LT2", "LT2 より上"],
  methodHelp:
    "選ぶ方法によって境界が変わります。乳酸閾値は推定の強度指標であり、FTP と同一ではありません。",
  export: "結果 CSV を出力",
  print: "レポートを印刷",
  report: "乳酸テストレポート",
  source: "計算の参照元",
  copied: "コピーしました",
  copy: "結果をコピー",
  quality: "データの確認事項",
  methodsTitle: "算出法と適用条件",
  instructionsTitle: "入力条件と分析手順",
  instructions: [
    "各ステージの終了時に強度と実測した血中乳酸を記録します。心拍数も記録する場合は同じステージに対応させます。",
    "種目と記録時の単位を選び、手入力・貼り付け・CSV 読み込みでデータを入力します。",
    "カーブと注意点を確認し、方法を比較して結果を出力します。再テストではできるだけ同じ手順を使ってください。",
  ],
  faqTitle: "乳酸テスト分析のよくある質問",
  faq: [
    {
      question: "Garmin の記録だけで使えますか？",
      answer:
        "このツールには各ステージで実測した乳酸値が必要です。レース結果やフィールドテストから推定したい場合は、別の乳酸閾値計算ツールをご利用ください。",
    },
    {
      question: "方法によって数値が違うのはなぜですか？",
      answer:
        "固定濃度、ベースラインからの増加、カーブの形状は異なる特徴を示します。最初の上昇を探す方法と、高い強度の境界を推定する方法があります。数値の一致だけで生理学的な正確さは証明できません。",
    },
    {
      question: "LT1 と LT2 は診断や練習メニューですか？",
      answer:
        "算出方法に依存する強度の参考値です。ステージ時間、採血方法、日々の変動が解釈に影響します。方法とテスト手順を結果と一緒に保存し、必要に応じて経験のあるコーチに相談してください。",
    },
    {
      question: "データはどこに保存されますか？",
      answer:
        "計算、CSV 解析、レポート生成はブラウザー内で行います。入力はアップロードされず、URL にも含まれません。再読み込みすると消えるため、必要な記録は出力してください。",
    },
  ],
  alternative: "実測した乳酸データがありませんか？",
  alternativeBody:
    "乳酸閾値計算ツールでは、レースやフィールドテストから練習強度の参考値を推定できます。",
  related: "関連ツール",
  cta: "トレーニング負荷と回復傾向を継続して確認",
  ctaBody:
    "日々のトレーニング記録、強度分布、コンディションの推移を合わせて確認し、トレーニング周期の計画と次回のテストに役立てます。",
  protocol: "テスト情報（任意）",
  stageMinutes: "1ステージの時間（分）",
  sampleSite: "採血部位",
  notRecorded: "記録なし",
  earlobe: "耳たぶ",
  fingertip: "指先",
  other: "その他",
  incomplete: "最後のステージを完了していない",
  excluded: "最後のステージを分析から除外",
  runtimeError:
    "分析を実行できませんでした。入力は保持されています。もう一度お試しください。",
  exportError: "出力を準備できませんでした。もう一度お試しください。",
  recordingError:
    "ファイル、行、数値、列の対応を確認してください。CSV は 256 KiB、100 行、16 列までです。",
  methodNames,
  methodDescriptions: {
    obla_2:
      "3次近似カーブが最後に 2 mmol/L を上向きに通過する強度。固定濃度は全員の第1閾値を表すものではありません。",
    obla_4:
      "3次近似カーブが最後に 4 mmol/L を上向きに通過する強度。この値を一律に LT2 とみなすことはできません。",
    bsln_05:
      "ベースラインに 0.5 mmol/L を加えた値に達する強度。安静時サンプルがなければ最初の運動ステージを基準にします。",
    bsln_10:
      "ベースラインに 1.0 mmol/L を加えた値に達する強度。1つの基準サンプルが結果に影響します。",
    log_log:
      "強度と乳酸を対数変換し、分割ステージを共有する2本の直線を当てはめます。残差が最小の分割の交点を求めます。5段階以上が必要です。",
    dmax: "運動ステージの3次近似カーブと、その両端を結ぶ直線との下向き距離が最大になる点。",
    moddmax:
      "隣り合う乳酸値が初めて 0.4 mmol/L 以上上昇する直前のステージから、最後の実測点まで直線を引きます。",
    log_poly_moddmax:
      "Log-log の強度に対応する3次カーブ上の点から、最後の実測乳酸点まで直線を引きます。有効な Log-log の結果が必要です。",
  },
  reasons: {
    invalid_value:
      "該当行を確認してください。乳酸と任意の心拍数は有限の正数です。強度 0 は安静時のみ使用します。",
    too_few_stages:
      "運動ステージが4段階以上必要です。Log-log は5段階以上必要です。",
    too_many_stages: "運動ステージは30段階までです。",
    duplicate_intensity:
      "同じ強度が複数あります。重複するステージを確認してください。",
    unsorted_stages:
      "強度を昇順にしてください。分析前に並べ替えを確認できます。",
    fit_degenerate: "このデータから安定した3次カーブを求められません。",
    target_not_reached:
      "測定範囲内でカーブが目標濃度を上向きに通過していません。",
    loglog_unavailable:
      "運動ステージの範囲内に有効な Log-log の交点がありません。",
    no_lactate_rise: "隣接するステージで 0.4 mmol/L 以上の上昇がありません。",
    no_distance: "カーブが基準線の下側に位置する有効な距離点がありません。",
    no_resting_sample:
      "安静時サンプルがないため、最初の運動ステージを基準に使用します。",
    few_stages:
      "ステージが少ないため、1つのサンプルが結果を大きく変える可能性があります。",
    early_dip:
      "前半で乳酸値が低下しています。採血やウォームアップの状況を確認してください。",
    final_not_rising:
      "最終ステージで乳酸が上昇していません。予定した強度に達したか確認してください。",
    uneven_steps:
      "強度の増分が一定ではありません。テスト手順と合わせて解釈してください。",
    threshold_at_edge: "推定値が測定範囲の端にあります。",
    negative_fit:
      "近似カーブに負の値があります。近似とサンプルを確認してください。",
    invalid_pair:
      "有効な方法を選び、LT1 が LT2 より低いことを確認してください。",
  },
};

const ko: BaseLactateCopy = {
  title: "젖산 곡선 계산기",
  description:
    "사이클링 또는 러닝 점증 부하 테스트의 실측 혈중 젖산 데이터를 분석합니다. 역치 산출 방법을 비교하고 강도 영역을 설정하며 분석 결과를 내보내세요.",
  badge: "점증 부하 테스트",
  privacy:
    "무료이며 가입이 필요 없습니다. 테스트 데이터는 현재 브라우저 탭에만 유지되며 내보내지 않으면 새로고침 시 사라집니다.",
  inputTitle: "테스트 데이터",
  resultTitle: "테스트 분석",
  empty:
    "각 단계 데이터를 입력하거나 예시를 불러와 분석 과정을 확인하세요.",
  stale:
    "입력이 변경되었습니다. 결과를 사용하거나 내보내기 전에 다시 분석하세요.",
  sample: "설명용 예시입니다 — 본인의 테스트 데이터가 아닙니다",
  cycling: "사이클링",
  running: "러닝",
  intensity: "강도",
  lactate: "젖산",
  heartRate: "심박수",
  stage: "단계",
  rest: "안정 시 샘플에는 0을 입력하세요",
  example: "예시 불러오기",
  clear: "데이터 지우기",
  add: "단계 추가",
  remove: "단계 삭제",
  analyze: "데이터 분석",
  calculating: "분석 중…",
  paste: "표 붙여넣기",
  import: "CSV 가져오기",
  template: "CSV 템플릿 다운로드",
  confirmImport: "이 열 사용",
  cancel: "취소",
  mapping: "열과 단위 확인",
  noColumn: "기록 안 됨",
  sort: "강도순으로 단계 정렬",
  overwrite: "현재 단계 데이터를 덮어쓰시겠습니까?",
  resetSport: "종목을 변경하면 현재 데이터가 삭제됩니다. 계속하시겠습니까?",
  pasteHelp:
    "쉼표 또는 탭으로 구분된 행을 붙여넣으세요. 소수점은 “.”를 사용합니다. 데이터를 교체하기 전에 열 매핑을 확인하세요.",
  inputHelp:
    "운동 단계 4–30개를 입력하세요(6–10개 권장). 젖산 단위는 mmol/L이며 심박수는 선택 사항입니다. 각 행은 빠짐없이 입력해야 하며, 0은 선택적 안정 시 샘플을 뜻합니다.",
  method: "방법",
  threshold: "역치",
  selected: "차트에 표시된 방법",
  unavailable: "사용 불가",
  partial:
    "일부 방법에서는 역치를 찾을 수 없었습니다. 계산 가능한 결과만 아래에 표시됩니다.",
  noResult:
    "적용 가능한 역치를 찾지 못했습니다. 단계 데이터와 방법 설명을 확인하세요. 테스트 범위를 벗어난 외삽은 수행하지 않습니다.",
  lt1: "제1 역치 (LT1)",
  lt2: "제2 역치 (LT2)",
  zones: "세 가지 강도 존",
  zoneNames: ["LT1 미만", "LT1~LT2", "LT2 초과"],
  methodHelp:
    "선택한 방법에 따라 경계가 달라집니다. 젖산 역치는 추정치이며 자동으로 FTP와 동일하지 않습니다.",
  export: "결과 CSV 다운로드",
  print: "리포트 인쇄",
  report: "젖산 테스트 리포트",
  source: "계산 참고 문헌",
  copied: "복사됨",
  copy: "결과 복사",
  quality: "데이터 품질 참고",
  methodsTitle: "방법 및 적용 조건",
  instructionsTitle: "데이터 요구 사항 및 절차",
  instructions: [
    "각 단계가 끝날 때 강도와 실측 혈중 젖산을 기록하세요. 선택적으로 기록하는 심박수도 동일한 단계의 값이어야 합니다.",
    "종목과 기록에 사용한 단위를 선택한 뒤 데이터를 직접 입력하거나 붙여넣기 또는 CSV로 가져오세요.",
    "곡선과 경고를 확인하고 방법을 비교한 다음 선택한 해석을 내보내세요. 재측정 시 동일한 프로토콜을 유지하는 것이 좋습니다.",
  ],
  faqTitle: "젖산 테스트 분석 자주 묻는 질문",
  faq: [
    {
      question: "혈중 젖산 채혈 없이 Garmin 데이터만 사용할 수 있나요?",
      answer:
        "이 도구는 각 단계의 실측 젖산값이 필요합니다. 레이스 기록이나 필드 테스트로 추정하려면 별도의 젖산 역치 계산기를 사용하세요.",
    },
    {
      question: "방법마다 수치가 다르게 나오는 이유는 무엇인가요?",
      answer:
        "고정 농도, 기준선 상승, 곡선 기하학은 서로 다른 특징을 설명합니다. 어떤 방법은 첫 상승을 찾고, 다른 방법은 더 높은 경계를 추정합니다. 수치의 일치가 생리학적 정확성을 입증하지는 않습니다.",
    },
    {
      question: "LT1과 LT2는 의학적 진단이나 훈련 처방인가요?",
      answer:
        "방법에 따라 달라지는 강도 기준치입니다. 단계 시간, 채혈 방식, 일별 변동이 해석에 영향을 줍니다. 방법과 프로토콜을 결과와 함께 보관하고, 적용 시 자격을 갖춘 코치와 상의하세요.",
    },
    {
      question: "내 테스트 데이터는 어떻게 처리되나요?",
      answer:
        "계산, CSV 파싱, 리포트 생성은 모두 로컬에서 실행됩니다. 입력값은 업로드되거나 URL에 포함되지 않습니다. 탭을 새로고침하면 삭제되므로 보관이 필요하면 리포트를 다운로드하세요.",
    },
  ],
  alternative: "실측 젖산 샘플이 없으신가요?",
  alternativeBody:
    "젖산 역치 계산기를 이용해 레이스나 필드 테스트로 훈련 기준치를 추정해 보세요.",
  related: "관련 도구",
  cta: "시간에 따른 훈련 부하와 회복 추세를 추적하세요",
  ctaBody:
    "일일 훈련 기록, 강도 분포, 컨디션 추세를 함께 살펴보며 훈련 주기를 계획하고 다음 테스트를 맥락 속에서 해석하세요.",
  protocol: "선택적 테스트 정보",
  stageMinutes: "단계당 시간(분)",
  sampleSite: "채혈 부위",
  notRecorded: "기록 안 됨",
  earlobe: "귓불",
  fingertip: "손가락 끝",
  other: "기타",
  incomplete: "마지막 단계를 완료하지 못함",
  excluded: "분석에서 마지막 단계 제외",
  runtimeError:
    "분석을 실행하지 못했습니다. 입력 데이터는 그대로 유지되어 있으니 다시 시도해 주세요.",
  exportError: "내보내기를 준비하지 못했습니다. 다시 시도해 주세요.",
  recordingError:
    "파일, 행, 숫자 값 및 열 매핑을 확인하세요. CSV 제한: 256 KiB, 100줄, 16열.",
  methodNames,
  methodDescriptions: {
    obla_2:
      "적합된 3차 곡선이 마지막으로 2 mmol/L를 상향 통과하는 강도입니다. 고정 농도가 모든 사람의 제1 역치인 것은 아닙니다.",
    obla_4:
      "적합된 3차 곡선이 마지막으로 4 mmol/L를 상향 통과하는 강도입니다. 이 고정 기준이 보편적인 LT2는 아닙니다.",
    bsln_05:
      "기준선 + 0.5 mmol/L 지점의 강도입니다. 기준선은 안정 시 샘플이며, 안정 시 샘플이 없으면 첫 번째 운동 단계를 사용합니다.",
    bsln_10:
      "기준선 + 1.0 mmol/L 지점의 강도입니다. 단일 기준선 샘플에 따라 추정치가 달라질 수 있습니다.",
    log_log:
      "로그 강도와 로그 젖산에 분할 단계를 공유하는 두 직선을 적합합니다. 잔차가 최소인 분할에서 교점을 구하며 최소 5단계가 필요합니다.",
    dmax: "적합된 3차 곡선의 첫 점과 끝점을 잇는 직선 아래에서 거리가 가장 큰 지점입니다. 운동 단계만 적합합니다.",
    moddmax:
      "인접 단계에서 처음으로 젖산이 0.4 mmol/L 이상 상승하기 직전 단계부터 관측된 기준점을 사용해 기준선을 긋습니다.",
    log_poly_moddmax:
      "3차 곡선 위의 Log-log 강도 지점에서 마지막 실측 젖산 지점까지 기준선을 긋습니다. 유효한 Log-log 결과가 필요합니다.",
  },
  reasons: {
    invalid_value:
      "강조된 행을 확인하세요. 젖산과 선택적 심박수는 유한한 양수여야 하며, 강도 0은 안정 시에만 사용할 수 있습니다.",
    too_few_stages:
      "최소 4개의 운동 단계가 필요합니다. Log-log는 5단계가 필요합니다.",
    too_many_stages: "운동 단계는 최대 30개까지 입력할 수 있습니다.",
    duplicate_intensity:
      "각 강도는 한 번만 입력해야 합니다. 중복된 단계를 확인하세요.",
    unsorted_stages:
      "단계 강도는 오름차순이어야 합니다. 분석 전에 정렬을 확인하세요.",
    fit_degenerate: "이 단계 데이터로는 안정적인 3차 곡선 적합이 불가능합니다.",
    target_not_reached:
      "적합된 곡선이 테스트 범위 내에서 이 목표 농도를 상향 통과하지 않습니다.",
    loglog_unavailable:
      "운동 단계 범위 내에서 유효한 Log-log 교점을 찾지 못했습니다.",
    no_lactate_rise: "인접 단계에서 0.4 mmol/L 이상 상승한 구간이 없습니다.",
    no_distance: "기준선 아래에 양의 거리를 갖는 지점이 없습니다.",
    no_resting_sample:
      "안정 시 샘플 없음: 기준선 상승 방법은 첫 번째 운동 단계를 사용합니다.",
    few_stages: "단계 수가 적어 단일 샘플이 곡선 적합에 큰 영향을 줄 수 있습니다.",
    early_dip:
      "초반 단계에서 젖산이 감소합니다. 샘플과 워밍업 상태를 확인하세요.",
    final_not_rising:
      "마지막 단계에서 젖산이 증가하지 않습니다. 의도한 강도에 도달했는지 확인하세요.",
    uneven_steps:
      "단계별 강도 증가폭이 일정하지 않습니다. 테스트 프로토콜과 함께 해석하세요.",
    threshold_at_edge: "이 추정치는 측정 범위의 경계에 위치합니다.",
    negative_fit:
      "적합된 곡선이 0 아래로 내려갑니다. 적합 품질과 샘플 값을 확인하세요.",
    invalid_pair:
      "존을 사용하기 전에 LT1이 LT2보다 낮도록 유효한 방법을 선택하세요.",
  },
};

const de: BaseLactateCopy = {
  title: "Laktatkurven-Rechner",
  description:
    "Analysiere gemessene Blutlaktatwerte aus Stufentests im Radfahren oder Laufen. Vergleiche Schwellenmethoden, definiere Intensitätsbereiche und exportiere die Auswertung.",
  badge: "Stufentest",
  privacy:
    "Kostenlos, ohne Anmeldung. Testdaten bleiben in diesem Browser-Tab und gehen beim Neuladen verloren, sofern sie nicht exportiert werden.",
  inputTitle: "Deine Testdaten",
  resultTitle: "Testanalyse",
  empty:
    "Gib deine Stufendaten ein oder lade ein Beispiel, um die Auswertung zu sehen.",
  stale:
    "Deine Eingaben wurden geändert. Analysiere erneut, bevor du diese Ergebnisse nutzt oder exportierst.",
  sample: "Veranschaulichungsbeispiel — nicht deine Testdaten",
  cycling: "Radfahren",
  running: "Laufen",
  intensity: "Intensität",
  lactate: "Laktat",
  heartRate: "Herzfrequenz",
  stage: "Stufe",
  rest: "Für eine Ruheprobe 0 verwenden",
  example: "Beispiel laden",
  clear: "Daten löschen",
  add: "Stufe hinzufügen",
  remove: "Stufe entfernen",
  analyze: "Daten analysieren",
  calculating: "Analysiere…",
  paste: "Tabelle einfügen",
  import: "CSV importieren",
  template: "CSV-Vorlage herunterladen",
  confirmImport: "Diese Spalten verwenden",
  cancel: "Abbrechen",
  mapping: "Spalten und Einheiten prüfen",
  noColumn: "Nicht erfasst",
  sort: "Stufen nach Intensität sortieren",
  overwrite: "Aktuelle Stufendaten ersetzen?",
  resetSport:
    "Beim Wechsel der Sportart werden die aktuellen Daten gelöscht. Fortfahren?",
  pasteHelp:
    "Komma- oder tabulatorgetrennte Zeilen einfügen. Dezimalpunkt: „.“. Bestätige die Spaltenzuordnung, bevor Daten ersetzt werden.",
  inputHelp:
    "4–30 Belastungsstufen eingeben; 6–10 sind empfehlenswert. Laktat: mmol/L. Herzfrequenz ist optional. Jede Zeile muss vollständig sein; 0 markiert eine optionale Ruheprobe.",
  method: "Methode",
  threshold: "Schwelle",
  selected: "Im Diagramm gezeigte Methode",
  unavailable: "Nicht verfügbar",
  partial:
    "Einige Methoden konnten keine Schwelle bestimmen. Verfügbare Ergebnisse stehen unten.",
  noResult:
    "Es wurde keine anwendbare Schwelle gefunden. Prüfe Stufendaten und Methodenhinweise; Ergebnisse werden nicht über den Testbereich hinaus extrapoliert.",
  lt1: "Erste Schwelle (LT1)",
  lt2: "Zweite Schwelle (LT2)",
  zones: "Drei Intensitätszonen",
  zoneNames: ["Unterhalb LT1", "LT1 bis LT2", "Oberhalb LT2"],
  methodHelp:
    "Die Methodenwahl verändert die Grenzen. Laktatschwellen sind Schätzwerte; sie entsprechen nicht automatisch der FTP.",
  export: "Ergebnisse als CSV herunterladen",
  print: "Bericht drucken",
  report: "Laktattest-Bericht",
  source: "Berechnungsreferenz",
  copied: "Kopiert",
  copy: "Ergebnisse kopieren",
  quality: "Hinweise zur Datenqualität",
  methodsTitle: "Methoden und Anwendbarkeit",
  instructionsTitle: "Datenanforderungen und Ablauf",
  instructions: [
    "Erfasse Intensität und gemessenes Blutlaktat am Ende jeder Stufe. Optionale Herzfrequenzen müssen denselben Stufen entsprechen.",
    "Wähle die Sportart und die verwendeten Einheiten aus und gib die Zeilen ein, füge sie ein oder importiere sie.",
    "Prüfe Kurve und Warnhinweise, vergleiche die Methoden und exportiere die gewählte Auswertung. Wiederhole Tests mit vergleichbarem Protokoll.",
  ],
  faqTitle: "Fragen zur Laktattest-Analyse",
  faq: [
    {
      question: "Kann ich Garmin-Daten ohne Blutlaktatproben verwenden?",
      answer:
        "Dieses Tool benötigt gemessene Laktatwerte pro Stufe. Für eine Schätzung aus Wettkampfergebnissen oder einem Feldtest nutze den separaten Laktatschwellen-Rechner.",
    },
    {
      question: "Warum liefern die Methoden unterschiedliche Werte?",
      answer:
        "Feste Konzentrationen, Basislinienanstiege und Kurvengeometrie beschreiben unterschiedliche Merkmale. Manche Methoden zielen auf den ersten Anstieg ab, andere auf eine höhere Grenze. Übereinstimmung beweist keine physiologische Genauigkeit.",
    },
    {
      question: "Sind LT1 und LT2 eine Diagnose oder ein Trainingsplan?",
      answer:
        "Sie sind methodenabhängige Intensitätsreferenzen. Stufendauer, Probenahme und Tagesform beeinflussen die Interpretation. Bewahre Methode und Protokoll gemeinsam mit dem Ergebnis auf; ein qualifizierter Coach hilft bei der Anwendung.",
    },
    {
      question: "Was passiert mit meinen Testdaten?",
      answer:
        "Berechnung, CSV-Auswertung und Berichterstellung laufen lokal im Browser. Eingaben werden weder hochgeladen noch in der URL gespeichert. Beim Neuladen des Tabs werden sie gelöscht; lade bei Bedarf einen Bericht herunter.",
    },
  ],
  alternative: "Keine gemessenen Laktatproben?",
  alternativeBody:
    "Schätze eine Trainingsreferenz aus einem Wettkampf oder Feldtest mit unserem Laktatschwellen-Rechner.",
  related: "Verwandte Tools",
  cta: "Trainingsbelastung und Erholung langfristig verfolgen",
  ctaBody:
    "Kombiniere tägliche Trainingsaufzeichnungen, Intensitätsverteilung und Formtrends, um deinen Trainingszyklus zu planen und künftige Tests einzuordnen.",
  protocol: "Optionale Testinformationen",
  stageMinutes: "Minuten pro Stufe",
  sampleSite: "Entnahmestelle",
  notRecorded: "Nicht erfasst",
  earlobe: "Ohrläppchen",
  fingertip: "Fingerkuppe",
  other: "Sonstige",
  incomplete: "Die letzte Stufe wurde nicht abgeschlossen",
  excluded: "Letzte Stufe aus der Analyse ausschließen",
  runtimeError:
    "Die Analyse konnte nicht ausgeführt werden. Deine Eingaben sind noch vorhanden; bitte versuche es erneut.",
  exportError:
    "Der Export konnte nicht vorbereitet werden. Bitte versuche es erneut.",
  recordingError:
    "Prüfe Datei, Zeilen, Zahlenwerte und Spaltenzuordnung. CSV-Limit: 256 KiB, 100 Textzeilen, 16 Spalten.",
  methodNames,
  methodDescriptions: {
    obla_2:
      "Intensität, bei der die kubische Kurve zuletzt steigend 2 mmol/L überschreitet. Eine feste Konzentration ist nicht für alle die erste Schwelle.",
    obla_4:
      "Intensität, bei der die kubische Kurve zuletzt steigend 4 mmol/L überschreitet. Dieser feste Wert ist nicht universell LT2.",
    bsln_05:
      "Intensität bei Basislinie plus 0,5 mmol/L. Als Basislinie gilt die Ruheprobe oder, falls nicht erfasst, die erste Belastungsstufe.",
    bsln_10:
      "Intensität bei Basislinie plus 1,0 mmol/L. Eine einzelne Basisprobe kann diese Schätzung verschieben.",
    log_log:
      "Zwei Geraden, angepasst an log-Intensität und log-Laktat mit gemeinsamer gemessener Trennstufe. Die Aufteilung mit minimalem Residuum bestimmt den Schnittpunkt. Mindestens fünf Stufen erforderlich.",
    dmax: "Größter Abstand unterhalb der Geraden zwischen dem ersten und letzten Punkt der kubischen Anpassung. Es werden nur Belastungsstufen angepasst.",
    moddmax:
      "Die Referenzlinie beginnt vor dem ersten benachbarten Laktatanstieg von mindestens 0,4 mmol/L anhand gemessener Ankerwerte.",
    log_poly_moddmax:
      "Die Referenzlinie verläuft von der Log-log-Intensität auf der kubischen Kurve bis zum letzten gemessenen Laktatwert. Erfordert ein gültiges Log-log-Ergebnis.",
  },
  reasons: {
    invalid_value:
      "Prüfe die markierte Zeile. Verwende endliche, positive Laktat- und optionale Herzfrequenzwerte; Intensität 0 ist nur für die Ruheprobe zulässig.",
    too_few_stages:
      "Mindestens vier Belastungsstufen erforderlich; Log-log benötigt fünf.",
    too_many_stages: "Maximal 30 Belastungsstufen verwenden.",
    duplicate_intensity:
      "Jede Intensität darf nur einmal vorkommen. Prüfe doppelte Stufen.",
    unsorted_stages:
      "Stufenintensitäten müssen aufsteigend sein. Bestätige vor der Analyse die Sortierung.",
    fit_degenerate:
      "Diese Stufen bestimmen keine stabile kubische Kurvenanpassung.",
    target_not_reached:
      "Die angepasste Kurve steigt im getesteten Bereich nicht über diesen Zielwert.",
    loglog_unavailable:
      "Im Bereich der Belastungsstufen wurde kein gültiger Log-log-Schnittpunkt gefunden.",
    no_lactate_rise:
      "Kein benachbarter Anstieg von mindestens 0,4 mmol/L gefunden.",
    no_distance:
      "Kein positiver Abstand unterhalb der Referenzlinie gefunden.",
    no_resting_sample:
      "Keine Ruheprobe: Basislinien-Methoden verwenden die erste Belastungsstufe.",
    few_stages:
      "Wenige Stufen: Eine einzelne Probe kann die Anpassung stark beeinflussen.",
    early_dip:
      "Das Laktat sinkt in den frühen Stufen. Prüfe Proben und Aufwärmkontext.",
    final_not_rising:
      "Das Laktat steigt in der letzten Stufe nicht an. Prüfe, ob die geplante Intensität erreicht wurde.",
    uneven_steps:
      "Die Intensitätsstufen sind ungleichmäßig. Bewahre das Testprotokoll zu diesem Ergebnis auf.",
    threshold_at_edge: "Diese Schätzung liegt am Rand des gemessenen Bereichs.",
    negative_fit:
      "Die angepasste Kurve fällt unter null. Prüfe Anpassungsqualität und Messwerte.",
    invalid_pair:
      "Wähle verfügbare Methoden mit LT1 unterhalb von LT2, bevor du die Zonen nutzt.",
  },
};

const fr: BaseLactateCopy = {
  title: "Calculateur de courbe de lactate",
  description:
    "Analysez le lactate sanguin mesuré lors de tests incrémentaux à vélo ou en course à pied. Comparez les méthodes de seuil, définissez les domaines d'intensité et exportez l'analyse.",
  badge: "Test par paliers",
  privacy:
    "Gratuit, sans inscription. Les données restent dans cet onglet du navigateur et sont perdues lors du rechargement sauf si vous les exportez.",
  inputTitle: "Vos données de test",
  resultTitle: "Analyse du test",
  empty:
    "Saisissez vos données par palier ou chargez un exemple pour voir comment fonctionne l'analyse.",
  stale:
    "Vos données ont été modifiées. Relancez l'analyse avant d'utiliser ou d'exporter ces résultats.",
  sample: "Exemple illustratif — pas vos données de test",
  cycling: "Cyclisme",
  running: "Course à pied",
  intensity: "Intensité",
  lactate: "Lactate",
  heartRate: "Fréquence cardiaque",
  stage: "Palier",
  rest: "Utilisez 0 pour un prélèvement au repos",
  example: "Charger un exemple",
  clear: "Effacer les données",
  add: "Ajouter un palier",
  remove: "Supprimer un palier",
  analyze: "Analyser les données",
  calculating: "Analyse en cours…",
  paste: "Coller un tableau",
  import: "Importer un CSV",
  template: "Télécharger le modèle CSV",
  confirmImport: "Utiliser ces colonnes",
  cancel: "Annuler",
  mapping: "Vérifier les colonnes et les unités",
  noColumn: "Non renseigné",
  sort: "Trier les paliers par intensité",
  overwrite: "Remplacer les données actuelles ?",
  resetSport:
    "Changer de sport efface les données actuelles. Continuer ?",
  pasteHelp:
    "Collez des lignes séparées par des virgules ou des tabulations. Séparateur décimal : « . ». Confirmez la correspondance des colonnes avant de remplacer les données.",
  inputHelp:
    "Saisissez 4 à 30 paliers d'effort ; 6 à 10 sont préférables. Lactate : mmol/L. La fréquence cardiaque est facultative. Chaque ligne doit être complète ; 0 indique un prélèvement de repos facultatif.",
  method: "Méthode",
  threshold: "Seuil",
  selected: "Méthode affichée sur le graphique",
  unavailable: "Indisponible",
  partial:
    "Certaines méthodes n'ont pas pu déterminer de seuil. Les résultats disponibles sont affichés ci-dessous.",
  noResult:
    "Aucun seuil applicable n'a été trouvé. Vérifiez les données de paliers et les notes de méthode ; les résultats ne sont pas extrapolés hors du test.",
  lt1: "Premier seuil (LT1)",
  lt2: "Second seuil (LT2)",
  zones: "Trois zones d'intensité",
  zoneNames: ["Sous LT1", "LT1 à LT2", "Au-dessus de LT2"],
  methodHelp:
    "Le choix de la méthode modifie les limites. Les seuils lactiques sont des estimations ; ils ne sont pas automatiquement équivalents à la FTP.",
  export: "Télécharger les résultats CSV",
  print: "Imprimer le rapport",
  report: "Rapport de test lactique",
  source: "Référence de calcul",
  copied: "Copié",
  copy: "Copier les résultats",
  quality: "Notes sur la qualité des données",
  methodsTitle: "Méthodes et conditions d'application",
  instructionsTitle: "Données requises et déroulement",
  instructions: [
    "Relevez l'intensité et le lactate sanguin mesuré à la fin de chaque palier. Les fréquences cardiaques facultatives doivent correspondre aux mêmes paliers.",
    "Choisissez le sport et les unités utilisés lors de l'enregistrement, puis saisissez, collez ou importez les lignes.",
    "Examinez la courbe et les avertissements, comparez les méthodes, puis exportez l'interprétation choisie. Répétez les tests avec un protocole comparable.",
  ],
  faqTitle: "Questions sur l'analyse des tests lactiques",
  faq: [
    {
      question:
        "Puis-je utiliser des données Garmin sans prélèvements de lactate sanguin ?",
      answer:
        "Cet outil nécessite un lactate mesuré à chaque palier. Pour une estimation à partir de résultats de course ou d'un test de terrain, utilisez le calculateur de seuil lactique dédié.",
    },
    {
      question: "Pourquoi les méthodes donnent-elles des chiffres différents ?",
      answer:
        "Les concentrations fixes, les hausses par rapport à la base et la géométrie de la courbe décrivent des caractéristiques distinctes. Certaines méthodes visent la première élévation, d'autres une limite supérieure. Leur convergence ne prouve pas l'exactitude physiologique.",
    },
    {
      question:
        "LT1 et LT2 constituent-ils un diagnostic ou une prescription d'entraînement ?",
      answer:
        "Ce sont des repères d'intensité dépendants de la méthode. La durée des paliers, le prélèvement et la variabilité quotidienne influencent l'interprétation. Conservez la méthode et le protocole avec le résultat ; un entraîneur qualifié peut vous aider à l'appliquer.",
    },
    {
      question: "Que deviennent mes données de test ?",
      answer:
        "Le calcul, la lecture CSV et la génération du rapport s'exécutent localement. Les données ne sont ni téléversées ni placées dans l'URL. Le rechargement de l'onglet les efface ; téléchargez un rapport si vous souhaitez les conserver.",
    },
  ],
  alternative: "Pas de prélèvements de lactate mesurés ?",
  alternativeBody:
    "Estimez un repère d'entraînement à partir d'une course ou d'un test de terrain avec notre calculateur de seuil lactique.",
  related: "Outils associés",
  cta: "Suivez votre charge d'entraînement et votre récupération dans le temps",
  ctaBody:
    "Combinez vos séances quotidiennes, la distribution d'intensité et l'évolution de votre condition pour planifier vos cycles et contextualiser vos prochains tests.",
  protocol: "Informations facultatives sur le test",
  stageMinutes: "Minutes par palier",
  sampleSite: "Site de prélèvement sanguin",
  notRecorded: "Non renseigné",
  earlobe: "Lobe d'oreille",
  fingertip: "Bout du doigt",
  other: "Autre",
  incomplete: "Le dernier palier n'a pas été terminé",
  excluded: "Exclure le dernier palier de l'analyse",
  runtimeError:
    "L'analyse n'a pas pu s'exécuter. Vos données sont toujours présentes ; veuillez réessayer.",
  exportError:
    "L'export n'a pas pu être préparé. Veuillez réessayer.",
  recordingError:
    "Vérifiez le fichier, les lignes, les valeurs numériques et la correspondance des colonnes. Limite CSV : 256 KiB, 100 lignes, 16 colonnes.",
  methodNames,
  methodDescriptions: {
    obla_2:
      "Intensité à laquelle la courbe cubique franchit 2 mmol/L pour la dernière fois à la hausse. Une concentration fixe ne correspond pas au premier seuil de chacun.",
    obla_4:
      "Intensité à laquelle la courbe cubique franchit 4 mmol/L pour la dernière fois à la hausse. Ce repère fixe n'est pas universellement LT2.",
    bsln_05:
      "Intensité à la ligne de base plus 0,5 mmol/L. La base est le prélèvement au repos, ou le premier palier d'effort en l'absence de mesure au repos.",
    bsln_10:
      "Intensité à la ligne de base plus 1,0 mmol/L. Un seul prélèvement de base peut déplacer cette estimation.",
    log_log:
      "Deux droites ajustées sur le logarithme de l'intensité et du lactate, partageant un palier mesuré de séparation. Le découpage à résidu minimal définit leur intersection. Au moins cinq paliers sont requis.",
    dmax: "Plus grande distance sous la droite reliant le premier et le dernier point de la courbe cubique ajustée. Seuls les paliers d'effort sont ajustés.",
    moddmax:
      "La ligne de référence démarre avant la première hausse adjacente de lactate d'au moins 0,4 mmol/L, à partir des valeurs observées.",
    log_poly_moddmax:
      "La ligne de référence relie l'intensité Log-log sur la courbe cubique au dernier point de lactate mesuré. Nécessite un résultat Log-log valide.",
  },
  reasons: {
    invalid_value:
      "Vérifiez la ligne surlignée. Utilisez des valeurs finies et positives pour le lactate et la fréquence cardiaque facultative ; l'intensité 0 est réservée au repos.",
    too_few_stages:
      "Au moins quatre paliers d'effort sont nécessaires ; Log-log en nécessite cinq.",
    too_many_stages: "Utilisez au maximum 30 paliers d'effort.",
    duplicate_intensity:
      "Chaque intensité ne doit apparaître qu'une fois. Vérifiez les paliers en double.",
    unsorted_stages:
      "Les intensités des paliers doivent être croissantes. Confirmez le tri avant l'analyse.",
    fit_degenerate:
      "Ces paliers ne permettent pas d'obtenir un ajustement cubique stable.",
    target_not_reached:
      "La courbe ajustée ne franchit pas cette cible à la hausse dans la plage testée.",
    loglog_unavailable:
      "Aucune intersection Log-log valide n'a été trouvée dans les paliers d'effort.",
    no_lactate_rise:
      "Aucune hausse adjacente d'au moins 0,4 mmol/L n'a été trouvée.",
    no_distance:
      "Aucune distance positive sous la ligne de référence n'a été trouvée.",
    no_resting_sample:
      "Pas de mesure au repos : les méthodes basées sur la ligne de base utilisent le premier palier d'effort.",
    few_stages:
      "Peu de paliers : un seul prélèvement peut fortement influencer l'ajustement.",
    early_dip:
      "Le lactate baisse lors des premiers paliers. Vérifiez les prélèvements et l'échauffement.",
    final_not_rising:
      "Le lactate n'augmente pas au dernier palier. Vérifiez si le test a atteint l'intensité prévue.",
    uneven_steps:
      "Les incréments d'intensité varient. Conservez le protocole de test avec ce résultat.",
    threshold_at_edge:
      "Cette estimation se situe au bord de la plage mesurée.",
    negative_fit:
      "La courbe ajustée passe sous zéro. Vérifiez la qualité de l'ajustement et les prélèvements.",
    invalid_pair:
      "Choisissez des méthodes disponibles avec LT1 inférieur à LT2 avant d'utiliser les zones.",
  },
};

const es: BaseLactateCopy = {
  title: "Calculadora de curva de lactato",
  description:
    "Analiza el lactato sanguíneo medido en pruebas incrementales de ciclismo o carrera. Compara métodos de umbral, define dominios de intensidad y exporta el análisis.",
  badge: "Prueba escalonada incremental",
  privacy:
    "Gratis y sin registro. Los datos de prueba permanecen en esta pestaña del navegador y se pierden al recargar a menos que los exportes.",
  inputTitle: "Datos de tu prueba",
  resultTitle: "Análisis de la prueba",
  empty:
    "Ingresa los datos de cada etapa o carga un ejemplo para ver cómo funciona el análisis.",
  stale:
    "Tus datos han cambiado. Vuelve a analizar antes de usar o exportar estos resultados.",
  sample: "Ejemplo ilustrativo — no son los datos de tu prueba",
  cycling: "Ciclismo",
  running: "Carrera",
  intensity: "Intensidad",
  lactate: "Lactato",
  heartRate: "Frecuencia cardíaca",
  stage: "Etapa",
  rest: "Usa 0 para una muestra en reposo",
  example: "Cargar ejemplo",
  clear: "Borrar datos",
  add: "Añadir etapa",
  remove: "Eliminar etapa",
  analyze: "Analizar datos",
  calculating: "Analizando…",
  paste: "Pegar una tabla",
  import: "Importar CSV",
  template: "Descargar plantilla CSV",
  confirmImport: "Usar estas columnas",
  cancel: "Cancelar",
  mapping: "Revisar columnas y unidades",
  noColumn: "Sin registrar",
  sort: "Ordenar etapas por intensidad",
  overwrite: "¿Reemplazar los datos actuales de las etapas?",
  resetSport:
    "Cambiar de deporte borra los datos actuales. ¿Deseas continuar?",
  pasteHelp:
    "Pega filas separadas por comas o tabulaciones. Punto decimal: “.”. Confirma la asignación de columnas antes de reemplazar los datos.",
  inputHelp:
    "Ingresa de 4 a 30 etapas de ejercicio; lo ideal son 6–10. Lactato: mmol/L. La frecuencia cardíaca es opcional. Cada fila debe estar completa; 0 indica una muestra opcional en reposo.",
  method: "Método",
  threshold: "Umbral",
  selected: "Método mostrado en el gráfico",
  unavailable: "No disponible",
  partial:
    "Algunos métodos no pudieron hallar un umbral. A continuación se muestran los resultados disponibles.",
  noResult:
    "No se encontró ningún umbral aplicable. Revisa los datos de las etapas y las notas del método; los resultados no se extrapolan fuera de la prueba.",
  lt1: "Primer umbral (LT1)",
  lt2: "Segundo umbral (LT2)",
  zones: "Tres zonas de intensidad",
  zoneNames: ["Por debajo de LT1", "LT1 a LT2", "Por encima de LT2"],
  methodHelp:
    "La elección del método cambia los límites. Los umbrales de lactato son estimaciones; no equivalen automáticamente al FTP.",
  export: "Descargar resultados CSV",
  print: "Imprimir informe",
  report: "Informe de prueba de lactato",
  source: "Referencia de cálculo",
  copied: "Copiado",
  copy: "Copiar resultados",
  quality: "Notas sobre la calidad de los datos",
  methodsTitle: "Métodos y aplicabilidad",
  instructionsTitle: "Requisitos de datos y flujo de trabajo",
  instructions: [
    "Registra la intensidad y el lactato sanguíneo medido al final de cada etapa. Las frecuencias cardíacas opcionales deben corresponder a las mismas etapas.",
    "Elige el deporte y las unidades usadas en tu registro; luego ingresa, pega o importa las filas.",
    "Inspecciona la curva y las advertencias, compara los métodos y exporta la interpretación elegida. Repite las pruebas con un protocolo comparable.",
  ],
  faqTitle: "Preguntas sobre el análisis de pruebas de lactato",
  faq: [
    {
      question: "¿Puedo usar datos de Garmin sin muestras de lactato en sangre?",
      answer:
        "Esta herramienta necesita lactato medido en cada etapa. Para una estimación a partir de resultados de carrera o una prueba de campo, usa la calculadora de umbral de lactato aparte.",
    },
    {
      question: "¿Por qué los métodos arrojan valores diferentes?",
      answer:
        "Las concentraciones fijas, los incrementos sobre la línea base y la geometría de la curva describen características distintas. Algunos métodos buscan el primer ascenso y otros estiman un límite superior. Que coincidan no demuestra precisión fisiológica.",
    },
    {
      question: "¿Son LT1 y LT2 un diagnóstico o una prescripción de entrenamiento?",
      answer:
        "Son referencias de intensidad que dependen del método. La duración de las etapas, la toma de muestras y la variación diaria afectan la interpretación. Conserva el método y el protocolo junto al resultado; un entrenador cualificado puede ayudarte a aplicarlo.",
    },
    {
      question: "¿Qué ocurre con los datos de mi prueba?",
      answer:
        "El cálculo, la lectura de CSV y la generación del informe se ejecutan localmente. Los datos no se suben ni se incluyen en la URL. Recargar la pestaña los borra; descarga un informe si necesitas conservar un registro.",
    },
  ],
  alternative: "¿No tienes muestras medidas de lactato?",
  alternativeBody:
    "Estima una referencia de entrenamiento a partir de una carrera o prueba de campo con nuestra calculadora de umbral de lactato.",
  related: "Herramientas relacionadas",
  cta: "Sigue tu carga de entrenamiento y recuperación a lo largo del tiempo",
  ctaBody:
    "Combina tus registros diarios de entrenamiento, la distribución de intensidad y las tendencias de estado para planificar tu ciclo y dar contexto a futuras pruebas.",
  protocol: "Información opcional de la prueba",
  stageMinutes: "Minutos por etapa",
  sampleSite: "Sitio de toma de muestra",
  notRecorded: "Sin registrar",
  earlobe: "Lóbulo de la oreja",
  fingertip: "Yema del dedo",
  other: "Otro",
  incomplete: "La última etapa no se completó",
  excluded: "Excluir la última etapa del análisis",
  runtimeError:
    "No se pudo ejecutar el análisis. Tus datos siguen aquí; por favor, inténtalo de nuevo.",
  exportError:
    "No se pudo preparar la exportación. Por favor, inténtalo de nuevo.",
  recordingError:
    "Revisa el archivo, las filas, los valores numéricos y la asignación de columnas. Límite CSV: 256 KiB, 100 líneas de texto, 16 columnas.",
  methodNames,
  methodDescriptions: {
    obla_2:
      "Intensidad en la que la curva cúbica ajustada cruza por última vez hacia arriba los 2 mmol/L. Una concentración fija no es el primer umbral de todas las personas.",
    obla_4:
      "Intensidad en la que la curva cúbica ajustada cruza por última vez hacia arriba los 4 mmol/L. Este valor fijo no equivale universalmente a LT2.",
    bsln_05:
      "Intensidad en la línea base más 0,5 mmol/L. La línea base es la muestra en reposo o la primera etapa de ejercicio si no se registró reposo.",
    bsln_10:
      "Intensidad en la línea base más 1,0 mmol/L. Una sola muestra base puede desplazar esta estimación.",
    log_log:
      "Dos rectas ajustadas al logaritmo de la intensidad y del lactato que comparten una etapa medida de división. La división de residuo mínimo determina su intersección. Se necesitan al menos cinco etapas.",
    dmax: "Mayor distancia por debajo de la recta que une el primer y el último punto de la curva cúbica ajustada. Solo se ajustan las etapas de ejercicio.",
    moddmax:
      "La línea de referencia comienza antes del primer aumento adyacente de lactato de al menos 0,4 mmol/L, usando valores de anclaje observados.",
    log_poly_moddmax:
      "La línea de referencia va desde la intensidad Log-log sobre la curva cúbica hasta el último punto de lactato medido. Depende de un resultado válido de Log-log.",
  },
  reasons: {
    invalid_value:
      "Revisa la fila resaltada. Usa valores finitos y positivos para el lactato y la frecuencia cardíaca opcional; la intensidad solo puede ser 0 para el reposo.",
    too_few_stages:
      "Se necesitan al menos cuatro etapas de ejercicio; Log-log requiere cinco.",
    too_many_stages: "Usa como máximo 30 etapas de ejercicio.",
    duplicate_intensity:
      "Cada intensidad debe aparecer solo una vez. Revisa las etapas duplicadas.",
    unsorted_stages:
      "Las intensidades de las etapas deben ser crecientes. Confirma el orden antes de analizar.",
    fit_degenerate:
      "Estas etapas no permiten determinar un ajuste cúbico estable.",
    target_not_reached:
      "La curva ajustada no cruza hacia arriba este objetivo dentro del rango evaluado.",
    loglog_unavailable:
      "No se encontró ninguna intersección Log-log válida dentro de las etapas de ejercicio.",
    no_lactate_rise:
      "No se encontró ningún aumento adyacente de al menos 0,4 mmol/L.",
    no_distance:
      "No se encontró ninguna distancia positiva por debajo de la línea de referencia.",
    no_resting_sample:
      "Sin muestra en reposo: los métodos de incremento sobre la base usan la primera etapa de ejercicio.",
    few_stages:
      "Pocas etapas: una sola muestra puede influir notablemente en el ajuste.",
    early_dip:
      "El lactato desciende en las primeras etapas. Revisa las muestras y el calentamiento.",
    final_not_rising:
      "El lactato no aumenta en la última etapa. Comprueba si la prueba alcanzó la intensidad prevista.",
    uneven_steps:
      "Los incrementos de intensidad varían. Conserva el protocolo de la prueba junto a este resultado.",
    threshold_at_edge:
      "Esta estimación se sitúa en un extremo del rango medido.",
    negative_fit:
      "La curva ajustada cae por debajo de cero. Revisa la calidad del ajuste y los valores de las muestras.",
    invalid_pair:
      "Elige métodos disponibles con LT1 por debajo de LT2 antes de usar las zonas.",
  },
};

const it: BaseLactateCopy = {
  title: "Calcolatore della curva del lattato",
  description:
    "Analizza il lattato ematico misurato nei test incrementali di ciclismo o corsa. Confronta i metodi di soglia, definisci i domini di intensità ed esporta l'analisi.",
  badge: "Test incrementale a stadi",
  privacy:
    "Gratuito, senza registrazione. I dati del test restano in questa scheda del browser e vanno persi al ricaricamento se non esportati.",
  inputTitle: "I dati del tuo test",
  resultTitle: "Analisi del test",
  empty:
    "Inserisci i dati degli stadi o carica un esempio per vedere come funziona l'analisi.",
  stale:
    "I dati inseriti sono cambiati. Riesegui l'analisi prima di usare o esportare questi risultati.",
  sample: "Esempio illustrativo — non sono i dati del tuo test",
  cycling: "Ciclismo",
  running: "Corsa",
  intensity: "Intensità",
  lactate: "Lattato",
  heartRate: "Frequenza cardiaca",
  stage: "Stadio",
  rest: "Usa 0 per un campione a riposo",
  example: "Carica esempio",
  clear: "Cancella dati",
  add: "Aggiungi stadio",
  remove: "Rimuovi stadio",
  analyze: "Analizza dati",
  calculating: "Analisi in corso…",
  paste: "Incolla una tabella",
  import: "Importa CSV",
  template: "Scarica modello CSV",
  confirmImport: "Usa queste colonne",
  cancel: "Annulla",
  mapping: "Controlla colonne e unità",
  noColumn: "Non registrato",
  sort: "Ordina gli stadi per intensità",
  overwrite: "Sostituire i dati degli stadi attuali?",
  resetSport:
    "Cambiare sport cancella i dati attuali. Continuare?",
  pasteHelp:
    "Incolla righe separate da virgole o tabulazioni. Separatore decimale: “.”. Conferma la mappatura delle colonne prima di sostituire i dati.",
  inputHelp:
    "Inserisci 4–30 stadi di esercizio; 6–10 sono preferibili. Lattato: mmol/L. La frequenza cardiaca è facoltativa. Ogni riga deve essere completa; 0 indica un campione a riposo facoltativo.",
  method: "Metodo",
  threshold: "Soglia",
  selected: "Metodo mostrato sul grafico",
  unavailable: "Non disponibile",
  partial:
    "Alcuni metodi non hanno trovato una soglia. I risultati disponibili sono mostrati sotto.",
  noResult:
    "Non è stata trovata alcuna soglia applicabile. Controlla i dati degli stadi e le note sui metodi; i risultati non vengono estrapolati oltre il test.",
  lt1: "Prima soglia (LT1)",
  lt2: "Seconda soglia (LT2)",
  zones: "Tre zone di intensità",
  zoneNames: ["Sotto LT1", "Da LT1 a LT2", "Sopra LT2"],
  methodHelp:
    "La scelta del metodo cambia i confini. Le soglie del lattato sono stime e non equivalgono automaticamente alla FTP.",
  export: "Scarica risultati CSV",
  print: "Stampa report",
  report: "Report del test del lattato",
  source: "Riferimento di calcolo",
  copied: "Copiato",
  copy: "Copia risultati",
  quality: "Note sulla qualità dei dati",
  methodsTitle: "Metodi e applicabilità",
  instructionsTitle: "Requisiti dei dati e flusso di lavoro",
  instructions: [
    "Registra l'intensità e il lattato ematico misurato alla fine di ogni stadio. Le frequenze cardiache facoltative devono appartenere agli stessi stadi.",
    "Scegli lo sport e le unità usate nella registrazione, poi inserisci, incolla o importa le righe.",
    "Esamina curva e avvisi, confronta i metodi ed esporta l'interpretazione scelta. Ripeti i test con un protocollo comparabile.",
  ],
  faqTitle: "Domande sull'analisi del test del lattato",
  faq: [
    {
      question: "Posso usare dati Garmin senza prelievi di lattato ematico?",
      answer:
        "Questo strumento richiede il lattato misurato a ogni stadio. Per una stima da risultati di gara o test sul campo, usa il calcolatore dedicato della soglia del lattato.",
    },
    {
      question: "Perché i metodi restituiscono numeri diversi?",
      answer:
        "Concentrazioni fisse, aumenti dalla linea di base e geometria della curva descrivono caratteristiche diverse. Alcuni metodi individuano il primo rialzo, altri stimano un confine più alto. La concordanza non dimostra l'accuratezza fisiologica.",
    },
    {
      question: "LT1 e LT2 sono una diagnosi o una prescrizione di allenamento?",
      answer:
        "Sono riferimenti di intensità dipendenti dal metodo. Durata degli stadi, prelievo e variabilità giornaliera influenzano l'interpretazione. Conserva metodo e protocollo insieme al risultato; un allenatore qualificato può aiutarti ad applicarlo.",
    },
    {
      question: "Cosa succede ai dati del mio test?",
      answer:
        "Calcolo, lettura CSV e generazione del report avvengono localmente. I dati non vengono caricati né inseriti nell'URL. Ricaricare la scheda li cancella; scarica un report se ti serve conservarli.",
    },
  ],
  alternative: "Nessun campione di lattato misurato?",
  alternativeBody:
    "Stima un riferimento di allenamento da una gara o un test sul campo con il nostro calcolatore della soglia del lattato.",
  related: "Strumenti correlati",
  cta: "Monitora il carico di allenamento e il recupero nel tempo",
  ctaBody:
    "Combina le registrazioni giornaliere, la distribuzione dell'intensità e l'andamento della condizione per pianificare il ciclo di allenamento e contestualizzare i test futuri.",
  protocol: "Informazioni facoltative sul test",
  stageMinutes: "Minuti per stadio",
  sampleSite: "Sede di prelievo ematico",
  notRecorded: "Non registrato",
  earlobe: "Lobo dell'orecchio",
  fingertip: "Polpastrello",
  other: "Altro",
  incomplete: "L'ultimo stadio non è stato completato",
  excluded: "Escludi l'ultimo stadio dall'analisi",
  runtimeError:
    "Impossibile eseguire l'analisi. I tuoi dati sono ancora qui; riprova.",
  exportError:
    "Impossibile preparare l'esportazione. Riprova.",
  recordingError:
    "Controlla file, righe, valori numerici e mappatura delle colonne. Limite CSV: 256 KiB, 100 righe di testo, 16 colonne.",
  methodNames,
  methodDescriptions: {
    obla_2:
      "Intensità alla quale la curva cubica adattata sale per l'ultima volta oltre 2 mmol/L. Una concentrazione fissa non rappresenta la prima soglia di tutti.",
    obla_4:
      "Intensità alla quale la curva cubica adattata sale per l'ultima volta oltre 4 mmol/L. Questo valore fisso non coincide universalmente con LT2.",
    bsln_05:
      "Intensità alla linea di base più 0,5 mmol/L. La linea di base è il campione a riposo oppure il primo stadio di esercizio se il riposo non è stato registrato.",
    bsln_10:
      "Intensità alla linea di base più 1,0 mmol/L. Un singolo campione di base può spostare questa stima.",
    log_log:
      "Due rette adattate a log-intensità e log-lattato che condividono uno stadio di divisione misurato. La divisione a residuo minimo determina l'intersezione. Servono almeno cinque stadi.",
    dmax: "Distanza massima sotto la retta che unisce il primo e l'ultimo punto della curva cubica adattata. Vengono adattati solo gli stadi di esercizio.",
    moddmax:
      "La linea di riferimento parte prima del primo aumento adiacente di lattato di almeno 0,4 mmol/L, usando i valori osservati come ancore.",
    log_poly_moddmax:
      "La linea di riferimento va dall'intensità Log-log sulla curva cubica all'ultimo punto di lattato misurato. Richiede un risultato Log-log valido.",
  },
  reasons: {
    invalid_value:
      "Controlla la riga evidenziata. Usa valori finiti e positivi per lattato e frequenza cardiaca facoltativa; l'intensità può essere 0 solo a riposo.",
    too_few_stages:
      "Servono almeno quattro stadi di esercizio; Log-log ne richiede cinque.",
    too_many_stages: "Usa al massimo 30 stadi di esercizio.",
    duplicate_intensity:
      "Ogni intensità deve comparire una sola volta. Controlla gli stadi duplicati.",
    unsorted_stages:
      "Le intensità degli stadi devono essere crescenti. Conferma l'ordinamento prima dell'analisi.",
    fit_degenerate:
      "Questi stadi non determinano un adattamento cubico stabile.",
    target_not_reached:
      "La curva adattata non supera al rialzo questo valore nell'intervallo testato.",
    loglog_unavailable:
      "Nessuna intersezione Log-log valida trovata all'interno degli stadi di esercizio.",
    no_lactate_rise:
      "Nessun aumento adiacente di almeno 0,4 mmol/L trovato.",
    no_distance:
      "Nessuna distanza positiva sotto la linea di riferimento trovata.",
    no_resting_sample:
      "Nessun campione a riposo: i metodi di incremento dalla base usano il primo stadio di esercizio.",
    few_stages:
      "Pochi stadi: un singolo campione può influenzare fortemente l'adattamento.",
    early_dip:
      "Il lattato cala nei primi stadi. Controlla i campioni e il contesto del riscaldamento.",
    final_not_rising:
      "Il lattato non aumenta nell'ultimo stadio. Verifica se il test ha raggiunto l'intensità prevista.",
    uneven_steps:
      "Gli incrementi di intensità variano. Conserva il protocollo del test con questo risultato.",
    threshold_at_edge:
      "Questa stima si trova a un'estremità dell'intervallo misurato.",
    negative_fit:
      "La curva adattata scende sotto zero. Controlla la qualità dell'adattamento e i valori dei campioni.",
    invalid_pair:
      "Scegli metodi disponibili con LT1 inferiore a LT2 prima di usare le zone.",
  },
};

const ptBR: BaseLactateCopy = {
  title: "Calculadora de curva de lactato",
  description:
    "Analise o lactato sanguíneo medido em testes incrementais de ciclismo ou corrida. Compare métodos de limiar, defina domínios de intensidade e exporte a análise.",
  badge: "Teste escalonado incremental",
  privacy:
    "Gratuito e sem cadastro. Os dados do teste ficam nesta aba do navegador e são perdidos ao recarregar, a menos que sejam exportados.",
  inputTitle: "Dados do seu teste",
  resultTitle: "Análise do teste",
  empty:
    "Insira os dados de cada estágio ou carregue um exemplo para ver como a análise funciona.",
  stale:
    "Seus dados foram alterados. Analise novamente antes de usar ou exportar estes resultados.",
  sample: "Exemplo ilustrativo — não são os dados do seu teste",
  cycling: "Ciclismo",
  running: "Corrida",
  intensity: "Intensidade",
  lactate: "Lactato",
  heartRate: "Frequência cardíaca",
  stage: "Estágio",
  rest: "Use 0 para uma amostra em repouso",
  example: "Carregar exemplo",
  clear: "Limpar dados",
  add: "Adicionar estágio",
  remove: "Remover estágio",
  analyze: "Analisar dados",
  calculating: "Analisando…",
  paste: "Colar uma tabela",
  import: "Importar CSV",
  template: "Baixar modelo CSV",
  confirmImport: "Usar estas colunas",
  cancel: "Cancelar",
  mapping: "Conferir colunas e unidades",
  noColumn: "Não registrado",
  sort: "Ordenar estágios por intensidade",
  overwrite: "Substituir os dados atuais dos estágios?",
  resetSport:
    "Trocar de esporte apaga os dados atuais. Continuar?",
  pasteHelp:
    "Cole linhas separadas por vírgula ou tabulação. Ponto decimal: “.”. Confirme o mapeamento das colunas antes de substituir os dados.",
  inputHelp:
    "Insira de 4 a 30 estágios de exercício; 6–10 são ideais. Lactato: mmol/L. A frequência cardíaca é opcional. Cada linha deve estar completa; 0 indica uma amostra opcional em repouso.",
  method: "Método",
  threshold: "Limiar",
  selected: "Método exibido no gráfico",
  unavailable: "Indisponível",
  partial:
    "Alguns métodos não conseguiram encontrar um limiar. Os resultados disponíveis aparecem abaixo.",
  noResult:
    "Nenhum limiar aplicável foi encontrado. Revise os dados dos estágios e as notas dos métodos; os resultados não são extrapolados além do teste.",
  lt1: "Primeiro limiar (LT1)",
  lt2: "Segundo limiar (LT2)",
  zones: "Três zonas de intensidade",
  zoneNames: ["Abaixo de LT1", "LT1 a LT2", "Acima de LT2"],
  methodHelp:
    "A escolha do método altera os limites. Limiares de lactato são estimativas e não equivalem automaticamente ao FTP.",
  export: "Baixar resultados CSV",
  print: "Imprimir relatório",
  report: "Relatório do teste de lactato",
  source: "Referência de cálculo",
  copied: "Copiado",
  copy: "Copiar resultados",
  quality: "Notas sobre a qualidade dos dados",
  methodsTitle: "Métodos e aplicabilidade",
  instructionsTitle: "Requisitos de dados e fluxo de trabalho",
  instructions: [
    "Registre a intensidade e o lactato sanguíneo medido ao final de cada estágio. Frequências cardíacas opcionais devem corresponder aos mesmos estágios.",
    "Escolha o esporte e as unidades usadas no registro e, em seguida, digite, cole ou importe as linhas.",
    "Inspecione a curva e os avisos, compare os métodos e exporte a interpretação escolhida. Repita os testes com um protocolo comparável.",
  ],
  faqTitle: "Perguntas sobre a análise do teste de lactato",
  faq: [
    {
      question: "Posso usar dados do Garmin sem amostras de lactato sanguíneo?",
      answer:
        "Esta ferramenta exige lactato medido em cada estágio. Para uma estimativa a partir de resultados de prova ou teste de campo, use a calculadora de limiar de lactato separada.",
    },
    {
      question: "Por que os métodos retornam valores diferentes?",
      answer:
        "Concentrações fixas, aumentos em relação à linha de base e geometria da curva descrevem características distintas. Alguns métodos buscam a primeira elevação; outros estimam um limite mais alto. Concordância entre métodos não comprova precisão fisiológica.",
    },
    {
      question: "LT1 e LT2 são um diagnóstico ou uma prescrição de treino?",
      answer:
        "São referências de intensidade dependentes do método. Duração dos estágios, coleta e variação diária afetam a interpretação. Guarde o método e o protocolo junto com o resultado; um treinador qualificado pode ajudar na aplicação.",
    },
    {
      question: "O que acontece com os dados do meu teste?",
      answer:
        "O cálculo, a leitura do CSV e a geração do relatório rodam localmente. Os dados não são enviados ao servidor nem colocados na URL. Recarregar a aba apaga os dados; baixe um relatório se precisar guardar o registro.",
    },
  ],
  alternative: "Sem amostras medidas de lactato?",
  alternativeBody:
    "Estime uma referência de treino a partir de uma prova ou teste de campo com nossa calculadora de limiar de lactato.",
  related: "Ferramentas relacionadas",
  cta: "Acompanhe a carga de treino e a recuperação ao longo do tempo",
  ctaBody:
    "Combine seus registros diários de treino, a distribuição de intensidade e as tendências de condicionamento para planejar seu ciclo e contextualizar futuros testes.",
  protocol: "Informações opcionais do teste",
  stageMinutes: "Minutos por estágio",
  sampleSite: "Local da coleta sanguínea",
  notRecorded: "Não registrado",
  earlobe: "Lóbulo da orelha",
  fingertip: "Ponta do dedo",
  other: "Outro",
  incomplete: "O último estágio não foi concluído",
  excluded: "Excluir o último estágio da análise",
  runtimeError:
    "Não foi possível executar a análise. Seus dados continuam aqui; tente novamente.",
  exportError:
    "Não foi possível preparar a exportação. Tente novamente.",
  recordingError:
    "Verifique o arquivo, as linhas, os valores numéricos e o mapeamento das colunas. Limite CSV: 256 KiB, 100 linhas de texto, 16 colunas.",
  methodNames,
  methodDescriptions: {
    obla_2:
      "Intensidade em que a curva cúbica ajustada cruza para cima pela última vez os 2 mmol/L. Uma concentração fixa não é o primeiro limiar de todas as pessoas.",
    obla_4:
      "Intensidade em que a curva cúbica ajustada cruza para cima pela última vez os 4 mmol/L. Esse marcador fixo não é universalmente o LT2.",
    bsln_05:
      "Intensidade na linha de base mais 0,5 mmol/L. A linha de base é a amostra de repouso ou o primeiro estágio de exercício quando não há amostra de repouso.",
    bsln_10:
      "Intensidade na linha de base mais 1,0 mmol/L. Uma única amostra de base pode deslocar essa estimativa.",
    log_log:
      "Duas retas ajustadas ao logaritmo da intensidade e do lactato, compartilhando um estágio medido de divisão. A divisão de menor resíduo determina a interseção. São necessários pelo menos cinco estágios.",
    dmax: "Maior distância abaixo da reta que liga o primeiro e o último ponto da curva cúbica ajustada. Apenas os estágios de exercício são ajustados.",
    moddmax:
      "A linha de referência começa antes do primeiro aumento adjacente de lactato de pelo menos 0,4 mmol/L, usando valores observados como âncora.",
    log_poly_moddmax:
      "A linha de referência vai da intensidade Log-log na curva cúbica até o último ponto de lactato medido. Depende de um resultado Log-log válido.",
  },
  reasons: {
    invalid_value:
      "Verifique a linha destacada. Use valores finitos e positivos para lactato e frequência cardíaca opcional; a intensidade só pode ser 0 para repouso.",
    too_few_stages:
      "São necessários pelo menos quatro estágios de exercício; Log-log exige cinco.",
    too_many_stages: "Use no máximo 30 estágios de exercício.",
    duplicate_intensity:
      "Cada intensidade deve aparecer apenas uma vez. Revise estágios duplicados.",
    unsorted_stages:
      "As intensidades dos estágios devem ser crescentes. Confirme a ordenação antes da análise.",
    fit_degenerate:
      "Estes estágios não determinam um ajuste cúbico estável.",
    target_not_reached:
      "A curva ajustada não cruza para cima esse valor-alvo dentro da faixa testada.",
    loglog_unavailable:
      "Nenhuma interseção Log-log válida foi encontrada dentro dos estágios de exercício.",
    no_lactate_rise:
      "Nenhum aumento adjacente de pelo menos 0,4 mmol/L foi encontrado.",
    no_distance:
      "Nenhuma distância positiva abaixo da linha de referência foi encontrada.",
    no_resting_sample:
      "Sem amostra de repouso: os métodos de acréscimo sobre a base usam o primeiro estágio de exercício.",
    few_stages:
      "Poucos estágios: uma única amostra pode afetar fortemente o ajuste.",
    early_dip:
      "O lactato cai nos estágios iniciais. Verifique as amostras e o contexto do aquecimento.",
    final_not_rising:
      "O lactato não aumenta no estágio final. Verifique se o teste atingiu a intensidade planejada.",
    uneven_steps:
      "Os incrementos de intensidade variam. Guarde o protocolo do teste com este resultado.",
    threshold_at_edge:
      "Esta estimativa está em uma extremidade da faixa medida.",
    negative_fit:
      "A curva ajustada cai abaixo de zero. Inspecione a qualidade do ajuste e os valores das amostras.",
    invalid_pair:
      "Escolha métodos disponíveis com LT1 abaixo de LT2 antes de usar as zonas.",
  },
};

// All 10 supported locales provide localized route copy; unknown locales fall back to English.
export function getLactateCopy(lang: string): LactateCopy {
  let base: BaseLactateCopy;
  switch (lang) {
    case "zh":
      base = zh;
      break;
    case "zh-hant":
      base = zhHant;
      break;
    case "ja":
      base = ja;
      break;
    case "ko":
      base = ko;
      break;
    case "de":
      base = de;
      break;
    case "fr":
      base = fr;
      break;
    case "es":
      base = es;
      break;
    case "it":
      base = it;
      break;
    case "pt-BR":
      base = ptBR;
      break;
    default:
      base = en;
      break;
  }
  return { ...base, presentation: getLactatePresentationCopy(lang) };
}
