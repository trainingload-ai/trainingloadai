import { isSeoIndexedLanguage } from "@/lib/i18n";

export type SeoMetadataContext =
  | "calculator"
  | "converter"
  | "docs"
  | "plan"
  | "product";

type SeoText = {
  title: string;
  description: string;
};

const TITLE_MIN_UNITS = 50;
const TITLE_MAX_UNITS = 60;
const DESCRIPTION_MIN_UNITS = 150;
const DESCRIPTION_MAX_UNITS = 160;

const CJK_OR_FULLWIDTH =
  /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe6f\uff01-\uff60\uffe0-\uffe6]/u;

/**
 * Search snippets are constrained by rendered width, not a universal raw
 * character count. Count CJK/full-width glyphs as two Latin-width units so
 * the same 50–60 / 150–160 guidance works across the indexed locales.
 */
export function seoDisplayUnits(value: string) {
  return [...value].reduce(
    (total, character) => total + (CJK_OR_FULLWIDTH.test(character) ? 2 : 1),
    0,
  );
}

function titleSuffixes(locale: string) {
  if (locale === "zh") {
    return [
      "｜Trainingload.ai 指南",
      "｜耐力训练实践指南｜Trainingload.ai",
      "｜耐力训练指标与实践指南｜Trainingload.ai",
      "｜耐力训练指标、计算与实践指南｜Trainingload.ai",
    ];
  }
  if (locale === "zh-hant") {
    return [
      "｜Trainingload.ai 指南",
      "｜耐力訓練實踐指南｜Trainingload.ai",
      "｜耐力訓練指標與實踐指南｜Trainingload.ai",
      "｜耐力訓練指標、計算與實踐指南｜Trainingload.ai",
    ];
  }
  if (locale === "ja") {
    return [
      "｜Trainingload.ai ガイド",
      "｜持久系トレーニング実践ガイド｜Trainingload.ai",
      "｜指標・計算・活用ガイド｜Trainingload.ai",
    ];
  }
  return [
    " | Trainingload.ai Guide",
    " | Training Guide | Trainingload.ai",
    " | Endurance Training Guide | Trainingload.ai",
  ];
}

function optimizeTitle(title: string, locale: string) {
  const base = title.trim();
  if (seoDisplayUnits(base) >= TITLE_MIN_UNITS) return base;

  const candidates = titleSuffixes(locale).map((suffix) => `${base}${suffix}`);
  const inRange = candidates
    .filter((candidate) => {
      const units = seoDisplayUnits(candidate);
      return units >= TITLE_MIN_UNITS && units <= TITLE_MAX_UNITS;
    })
    .sort(
      (left, right) =>
        Math.abs(seoDisplayUnits(left) - 55) -
        Math.abs(seoDisplayUnits(right) - 55),
    );

  return inRange[0] ?? base;
}

const ZH_DESCRIPTION_PHRASES: Record<SeoMetadataContext, readonly string[]> = {
  calculator: [
    "比较不同测试与公式。",
    "理解结果范围和误差。",
    "用于设置训练区间。",
    "结合长期趋势复查。",
    "再据此调整训练强度。",
    "方便复查。",
  ],
  converter: [
    "了解支持的文件类型。",
    "确认转换限制。",
    "查看数据处理方式。",
    "保护活动与路线隐私。",
    "转换后可直接下载。",
  ],
  docs: [
    "了解核心概念。",
    "查看计算逻辑。",
    "理解适用场景。",
    "避开常见误区。",
    "结合真实训练数据。",
    "用于训练分析和计划复盘。",
    "观察长期变化。",
    "辅助日常训练决策。",
  ],
  plan: [
    "查看逐周课表。",
    "理解训练递进。",
    "安排恢复与减量。",
    "可加入日历执行。",
    "根据完成情况复盘。",
    "理解每类课程的目的。",
    "跟踪长期适应和比赛准备。",
  ],
  product: [
    "了解核心功能。",
    "查看实际使用流程。",
    "连接训练数据与计划。",
    "结合负荷趋势复盘。",
    "据此做出下一步决策。",
  ],
};

const ZH_HANT_DESCRIPTION_PHRASES: Record<
  SeoMetadataContext,
  readonly string[]
> = {
  calculator: [
    "比較不同測試與公式。",
    "理解結果範圍和誤差。",
    "用於設定訓練區間。",
    "結合長期趨勢複查。",
    "再據此調整訓練強度。",
    "方便複查。",
  ],
  converter: [
    "了解支援的檔案類型。",
    "確認轉換限制。",
    "查看資料處理方式。",
    "保護活動與路線私隱。",
    "轉換後可直接下載。",
  ],
  docs: [
    "了解核心概念。",
    "查看計算邏輯。",
    "理解適用情境。",
    "避開常見誤區。",
    "結合真實訓練資料。",
    "用於訓練分析和計畫複盤。",
    "觀察長期變化。",
    "輔助日常訓練決策。",
  ],
  plan: [
    "查看逐週課表。",
    "理解訓練遞進。",
    "安排恢復與減量。",
    "可加入日曆執行。",
    "根據完成情況複盤。",
    "理解每類課程的目的。",
    "跟蹤長期適應和比賽準備。",
  ],
  product: [
    "了解核心功能。",
    "查看實際使用流程。",
    "連接訓練資料與計畫。",
    "結合負荷趨勢複盤。",
    "據此作出下一步決策。",
  ],
};

const JA_DESCRIPTION_PHRASES: Record<SeoMetadataContext, readonly string[]> = {
  calculator: [
    "テストと計算式を比較します。",
    "結果の範囲と誤差を確認します。",
    "トレーニングゾーン設定に活用できます。",
    "長期的な変化も見直せます。",
    "推移も確認できます。",
  ],
  converter: [
    "対応ファイル形式を確認できます。",
    "変換時の制限も説明します。",
    "データの処理方法が分かります。",
    "アクティビティのプライバシーも守ります。",
    "すぐ使えます。",
  ],
  docs: [
    "基本概念を整理します。",
    "計算方法を確認します。",
    "実際の使い方を説明します。",
    "よくある誤解も避けられます。",
    "実データでの分析と計画レビューに活用できます。",
  ],
  plan: [
    "週ごとのメニューを確認できます。",
    "負荷の段階的な進め方が分かります。",
    "回復とテーパリングも計画できます。",
    "カレンダーに追加して実行できます。",
  ],
  product: [
    "主要機能を確認できます。",
    "実際の利用手順が分かります。",
    "データと計画を一つにつなげます。",
    "負荷傾向から次の判断に進めます。",
  ],
};

const EN_DESCRIPTION_PHRASES: Record<SeoMetadataContext, readonly string[]> = {
  calculator: [
    " Compare supported tests and formulas.",
    " Understand result ranges and limitations.",
    " Apply the estimate to training zones.",
    " Review changes across long-term trends.",
  ],
  converter: [
    " Check supported file types.",
    " Understand conversion limits.",
    " See how activity data is processed.",
    " Keep route and workout data private.",
    " Download the converted file directly.",
  ],
  docs: [
    " Learn the core concept.",
    " Review the calculation method.",
    " Understand practical use cases.",
    " Avoid common interpretation mistakes.",
    " Apply it to real training data and plan reviews.",
  ],
  plan: [
    " Review every week and workout.",
    " Understand the progression.",
    " Schedule recovery and tapering.",
    " Add the plan to your calendar.",
    " Review results after each session.",
  ],
  product: [
    " Explore the core features.",
    " Follow the practical workflow.",
    " Connect training data with plans.",
    " Review load trends and next-step decisions.",
  ],
};

function descriptionPhrases(locale: string, context: SeoMetadataContext) {
  if (locale === "zh") return ZH_DESCRIPTION_PHRASES[context];
  if (locale === "zh-hant") return ZH_HANT_DESCRIPTION_PHRASES[context];
  if (locale === "ja") return JA_DESCRIPTION_PHRASES[context];
  return EN_DESCRIPTION_PHRASES[context];
}

function optimizeDescription(
  description: string,
  locale: string,
  context: SeoMetadataContext,
) {
  const base = description.trim();
  const baseUnits = seoDisplayUnits(base);
  if (baseUnits >= DESCRIPTION_MIN_UNITS) return base;

  const phrases = descriptionPhrases(locale, context);
  const candidates: string[] = [];
  for (let mask = 1; mask < 1 << phrases.length; mask += 1) {
    const additions = phrases.filter((_, index) => mask & (1 << index));
    candidates.push(`${base}${additions.join("")}`);
  }

  const inRange = candidates
    .filter((candidate) => {
      const units = seoDisplayUnits(candidate);
      return units >= DESCRIPTION_MIN_UNITS && units <= DESCRIPTION_MAX_UNITS;
    })
    .sort(
      (left, right) =>
        Math.abs(seoDisplayUnits(left) - 155) -
        Math.abs(seoDisplayUnits(right) - 155),
    );

  return inRange[0] ?? base;
}

export function optimizeSeoText({
  title,
  description,
  locale,
  context,
  optimizeShortTitle = false,
  optimizeShortDescription = true,
}: SeoText & {
  locale: string;
  context: SeoMetadataContext;
  optimizeShortTitle?: boolean;
  optimizeShortDescription?: boolean;
}): SeoText {
  if (!isSeoIndexedLanguage(locale)) return { title, description };

  return {
    title: optimizeShortTitle ? optimizeTitle(title, locale) : title,
    description: optimizeShortDescription
      ? optimizeDescription(description, locale, context)
      : description.trim(),
  };
}

export const SEO_METADATA_LIMITS = {
  title: { min: TITLE_MIN_UNITS, max: TITLE_MAX_UNITS },
  description: {
    min: DESCRIPTION_MIN_UNITS,
    max: DESCRIPTION_MAX_UNITS,
  },
} as const;
