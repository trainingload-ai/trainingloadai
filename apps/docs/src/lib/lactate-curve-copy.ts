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

// Indexed locales contain complete route copy; secondary locales use English.
export function getLactateCopy(lang: string): LactateCopy {
  const base =
    lang === "zh" ? zh : lang === "zh-hant" ? zhHant : lang === "ja" ? ja : en;
  return { ...base, presentation: getLactatePresentationCopy(lang) };
}
