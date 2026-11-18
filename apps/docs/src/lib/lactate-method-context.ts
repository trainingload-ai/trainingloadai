import type { LactateMethodId } from "@trainingloadai/shared/lactate-analysis";

export const LACTATE_REFERENCES = {
  kindermann: {
    author: "Kindermann et al. (1979)",
    title:
      "The significance of the aerobic-anaerobic transition for the determination of work load intensities during endurance training",
    journal: "European Journal of Applied Physiology · 42:25–34",
    url: "https://doi.org/10.1007/BF00421101",
  },
  heck: {
    author: "Heck et al. (1985)",
    title: "Justification of the 4-mmol/l lactate threshold",
    journal: "International Journal of Sports Medicine · 6:117–130",
    url: "https://doi.org/10.1055/s-2008-1025824",
  },
  berg: {
    author: "Berg et al. (1990)",
    title: "[Current aspects of modern ergometry]",
    journal: "Pneumologie · 44:2–13 · PMID 2408033",
    url: "https://pubmed.ncbi.nlm.nih.gov/2408033/",
  },
  zoladz: {
    author: "Zoladz et al. (1995)",
    title:
      "Non-linear relationship between O2 uptake and power output at high intensities of exercise in humans",
    journal: "The Journal of Physiology · 488:211–217",
    url: "https://doi.org/10.1113/jphysiol.1995.sp020959",
  },
  beaver: {
    author: "Beaver et al. (1985)",
    title:
      "Improved detection of lactate threshold during exercise using a log-log transformation",
    journal: "Journal of Applied Physiology · 59:1936–1940",
    url: "https://doi.org/10.1152/jappl.1985.59.6.1936",
  },
  cheng: {
    author: "Cheng et al. (1992)",
    title:
      "A new approach for the determination of ventilatory and lactate thresholds",
    journal: "International Journal of Sports Medicine · 13:518–522",
    url: "https://doi.org/10.1055/s-2007-1021309",
  },
  bishop: {
    author: "Bishop et al. (1998)",
    title:
      "The relationship between plasma lactate parameters, Wpeak and 1-h cycling performance in women",
    journal: "Medicine & Science in Sports & Exercise · 30:1270–1275",
    url: "https://doi.org/10.1097/00005768-199808000-00014",
  },
  jamnick: {
    author: "Jamnick et al. (2018)",
    title:
      "Manipulating graded exercise test variables affects the validity of the lactate threshold and V̇O2peak",
    journal: "PLOS ONE · 13:e0199794",
    url: "https://doi.org/10.1371/journal.pone.0199794",
  },
  heuberger: {
    author: "Heuberger et al. (2018)",
    title:
      "Repeatability and predictive value of lactate threshold concepts in endurance sports",
    journal: "PLOS ONE · 13:e0206846",
    url: "https://doi.org/10.1371/journal.pone.0206846",
  },
} as const;

type MethodContext = {
  origin: string;
  interpretation: string;
};
type MethodContextCopy = {
  originLabel: string;
  interpretationLabel: string;
  referencesTitle: string;
  introduction: string;
  implementation: string;
  methods: Record<LactateMethodId, MethodContext>;
};

const en: MethodContextCopy = {
  originLabel: "Origin",
  interpretationLabel: "Application and limits",
  referencesTitle: "References and implementation",
  introduction:
    "These methods identify different features of the same test. Their names do not establish an individual's LT1, LT2 or maximal lactate steady state (MLSS); stage duration, sampling and the studied population affect interpretation.",
  implementation:
    "Calculations are checked against the fixed lactater version below. Matching a software reference is not independent physiological validation.",
  methods: {
    obla_2: {
      origin:
        "Part of the fixed-concentration family. {jamnick} included 2 mmol/L among the concentrations compared in graded cycling tests.",
      interpretation:
        "Useful as a standardized comparison point. A fixed 2 mmol/L concentration does not establish an individual's first threshold; compare tests with consistent protocols.",
    },
    obla_4: {
      origin:
        "The 4 mmol/L criterion was discussed by {kindermann} and examined by {heck}, well before modern automated curve tools.",
      interpretation:
        "A conventional concentration, not a universal LT2 or measured MLSS. Individual lactate levels and test design can place this estimate above or below the relevant boundary.",
    },
    bsln_05: {
      origin:
        "A baseline-plus criterion. {jamnick} compared this family and cited {berg} and {zoladz} as earlier background.",
      interpretation:
        "Sensitive to the baseline sample and measurement variation. This tool uses resting lactate when present, otherwise the first exercise stage, rather than averaging early stages.",
    },
    bsln_10: {
      origin:
        "The same baseline-plus family, with a larger increment. {jamnick} compared +0.5, +1.0 and +1.5 mmol/L as separate criteria.",
      interpretation:
        "A +1.0 result is a different criterion from +0.5, not proof of a second physiological threshold. Changing the baseline definition also changes the estimate.",
    },
    log_log: {
      origin:
        "{beaver} analyzed lactate against oxygen uptake on logarithmic axes. Later cycling applications, including {bishop}, used power; this tool uses test intensity.",
      interpretation:
        "Requires at least five exercise stages and an intersection inside the tested range. Using intensity does not reproduce the original oxygen-uptake testing protocol.",
    },
    dmax: {
      origin:
        "{cheng} proposed Dmax: locate the greatest separation between a fitted response curve and the line joining its endpoints.",
      interpretation:
        "Depends on the tested range and fit. Here both reference endpoints lie on the cubic curve; changing the first or final stage can move the estimate.",
    },
    moddmax: {
      origin:
        "{bishop} modified the start of the Dmax reference line to reduce the influence of the early flat stages. {heuberger} later described a rise of at least 0.4 mmol/L.",
      interpretation:
        "This tool includes an exact 0.4 mmol/L rise and uses measured start/end lactate. {jamnick} describes >0.4; the inclusive rule follows Heuberger's formulation.",
    },
    log_poly_moddmax: {
      origin:
        "{jamnick} introduced this combination: a Log-log starting intensity followed by a modified Dmax calculation on a cubic curve.",
      interpretation:
        "Their closest MLSS estimate used 4-minute stages in 17 trained male cyclists. That finding does not validate every running or cycling protocol. A valid Log-log result is required.",
    },
  },
};

const zh: MethodContextCopy = {
  originLabel: "方法来源",
  interpretationLabel: "适用与局限",
  referencesTitle: "参考文献与实现依据",
  introduction:
    "这些方法识别的是同一次测试中的不同特征。方法名称本身不能确立个人的 LT1、LT2 或最大乳酸稳态（MLSS）；每档时长、采血方式和研究人群都会影响解读。",
  implementation:
    "本工具使用下列固定版本的 lactater 核对计算结果。与参考软件一致，不等于经过独立的生理效度验证。",
  methods: {
    obla_2: {
      origin:
        "属于固定乳酸浓度法。{jamnick} 在骑行阶梯负荷测试中，将 2 mmol/L 纳入多种固定浓度判据的比较。",
      interpretation:
        "可作为统一浓度下的比较点，但不能直接认定为个人第一乳酸阈值。复测比较应保持测试方案一致。",
    },
    obla_4: {
      origin:
        "4 mmol/L 判据在 {kindermann} 的研究中已有讨论，{heck} 进一步论证了这一经典固定浓度标准。",
      interpretation:
        "它是约定的浓度标准，并非所有人的 LT2 或实测 MLSS。个体乳酸水平和测试方案不同，估计值可能位于相应边界的两侧。",
    },
    bsln_05: {
      origin:
        "属于基线加固定增量的方法。{jamnick} 比较了这一方法族，并引用 {berg} 及 {zoladz} 作为早期研究背景。",
      interpretation:
        "对基线样本和测量波动较敏感。本工具优先使用静息乳酸，否则采用首个运动阶段；不取前几档的平均值。",
    },
    bsln_10: {
      origin:
        "与 +0.5 属于同一方法族，只是增量更大。{jamnick} 将 +0.5、+1.0、+1.5 mmol/L 作为不同判据分别比较。",
      interpretation:
        "+1.0 是另一项判据，不能仅因增量更大就视为第二生理阈值。基线的定义改变，结果也会改变。",
    },
    log_log: {
      origin:
        "{beaver} 最初在双对数坐标中分析乳酸与摄氧量的关系。{bishop} 等后续骑行研究使用功率；本工具使用测试强度。",
      interpretation:
        "至少需要 5 个运动阶段，且两段拟合的交点须位于实测范围内。以强度为横轴，并不等同于复现原始摄氧量测试方案。",
    },
    dmax: {
      origin:
        "{cheng} 提出 Dmax：在拟合曲线与其首尾端点连线之间，寻找最大距离对应的位置。",
      interpretation:
        "结果依赖测试覆盖范围和拟合。本工具将参考线的两个端点放在三次拟合曲线上；改变起始或末档，估计值可能移动。",
    },
    moddmax: {
      origin:
        "{bishop} 修改了 Dmax 参考线的起点，以减少前段平缓样本的影响。{heuberger} 进一步描述了“至少上升 0.4 mmol/L”的判据。",
      interpretation:
        "本工具计入恰好上升 0.4 mmol/L 的情况，并使用实测起点、终点乳酸。{jamnick} 写作 >0.4；这里采用 Heuberger 的包含等号规则。",
    },
    log_poly_moddmax: {
      origin:
        "{jamnick} 提出这一组合变体：先由 Log-log 确定起始强度，再对三次拟合曲线计算修正 Dmax。",
      interpretation:
        "该研究在 17 名受过训练的男性骑行者、每档 4 分钟的方案中得到最接近 MLSS 的估计，不能据此推广到所有跑步或骑行方案。计算须先获得有效的 Log-log 结果。",
    },
  },
};

const zhHant: MethodContextCopy = {
  originLabel: "方法來源",
  interpretationLabel: "適用與限制",
  referencesTitle: "參考文獻與實作依據",
  introduction:
    "這些方法辨識的是同一次測試中的不同特徵。方法名稱本身不能確立個人的 LT1、LT2 或最大乳酸穩態（MLSS）；每階段時長、採血方式和研究族群都會影響解讀。",
  implementation:
    "本工具使用下列固定版本的 lactater 核對計算結果。與參考軟體一致，不等於經過獨立的生理效度驗證。",
  methods: {
    obla_2: {
      origin:
        "屬於固定乳酸濃度法。{jamnick} 在自行車階梯負荷測試中，將 2 mmol/L 納入多種固定濃度判據的比較。",
      interpretation:
        "可作為統一濃度下的比較點，但不能直接認定為個人第一乳酸閾值。複測比較應保持測試方案一致。",
    },
    obla_4: {
      origin:
        "4 mmol/L 判據在 {kindermann} 的研究中已有討論，{heck} 進一步論證了這項經典固定濃度標準。",
      interpretation:
        "它是約定的濃度標準，並非所有人的 LT2 或實測 MLSS。個人乳酸水準與測試方案不同，估計值可能位於相應邊界的兩側。",
    },
    bsln_05: {
      origin:
        "屬於基線加固定增量的方法。{jamnick} 比較了這個方法族，並引用 {berg} 及 {zoladz} 作為早期研究背景。",
      interpretation:
        "對基線樣本與測量波動較敏感。本工具優先使用安靜時乳酸，否則採用首個運動階段；不取前幾階段的平均值。",
    },
    bsln_10: {
      origin:
        "與 +0.5 屬於同一方法族，只是增量較大。{jamnick} 將 +0.5、+1.0、+1.5 mmol/L 作為不同判據分別比較。",
      interpretation:
        "+1.0 是另一項判據，不能僅因增量較大就視為第二生理閾值。基線定義改變，結果也會改變。",
    },
    log_log: {
      origin:
        "{beaver} 最初在雙對數座標中分析乳酸與攝氧量的關係。{bishop} 等後續自行車研究使用功率；本工具使用測試強度。",
      interpretation:
        "至少需要 5 個運動階段，且兩段近似的交點須位於實測範圍內。以強度為橫軸，並不等同於重現原始攝氧量測試方案。",
    },
    dmax: {
      origin:
        "{cheng} 提出 Dmax：在近似曲線與其首尾端點連線之間，尋找最大距離對應的位置。",
      interpretation:
        "結果取決於測試涵蓋範圍與近似。本工具將參考線的兩個端點放在三次近似曲線上；改變起始或末階段，估計值可能移動。",
    },
    moddmax: {
      origin:
        "{bishop} 修改了 Dmax 參考線的起點，以減少前段平緩樣本的影響。{heuberger} 進一步描述了「至少上升 0.4 mmol/L」的判據。",
      interpretation:
        "本工具計入恰好上升 0.4 mmol/L 的情況，並使用實測起點、終點乳酸。{jamnick} 寫作 >0.4；這裡採用 Heuberger 的包含等號規則。",
    },
    log_poly_moddmax: {
      origin:
        "{jamnick} 提出這項組合變體：先由 Log-log 確定起始強度，再對三次近似曲線計算修正 Dmax。",
      interpretation:
        "該研究在 17 名受過訓練的男性自行車選手、每階段 4 分鐘的方案中得到最接近 MLSS 的估計，不能據此推廣至所有跑步或自行車方案。計算須先取得有效的 Log-log 結果。",
    },
  },
};

const ja: MethodContextCopy = {
  originLabel: "研究上の出典",
  interpretationLabel: "適用条件と限界",
  referencesTitle: "参考文献と実装の根拠",
  introduction:
    "各手法は同じテストの異なる特徴を捉えます。手法名だけで個人の LT1、LT2、最大乳酸定常状態（MLSS）が確定するわけではなく、ステージ時間、採血方法、研究対象者を考慮する必要があります。",
  implementation:
    "計算結果は以下の固定バージョンの lactater と照合しています。参照ソフトウェアとの一致は、独立した生理学的妥当性の検証を意味しません。",
  methods: {
    obla_2: {
      origin:
        "乳酸濃度を固定する手法の一つです。{jamnick}は自転車の漸増負荷テストで、2 mmol/L を含む複数の固定濃度を比較しました。",
      interpretation:
        "一定の濃度における比較点として使えますが、個人の第一乳酸閾値と同一視はできません。再テストでは同じプロトコルを用いて比較します。",
    },
    obla_4: {
      origin:
        "4 mmol/L の基準は {kindermann}が論じ、{heck}が検討した、古くからの固定濃度基準です。",
      interpretation:
        "慣例的な濃度基準であり、すべての人の LT2 や実測 MLSS ではありません。個人の乳酸値とテスト設計により、推定値は境界の上下にずれます。",
    },
    bsln_05: {
      origin:
        "ベースラインに一定量を加える手法です。{jamnick}が比較し、この手法群の背景として {berg}と {zoladz}を引用しています。",
      interpretation:
        "ベースラインのサンプルと測定変動に敏感です。本ツールは安静時値があればそれを、なければ最初の運動ステージを使用し、前半の平均値は用いません。",
    },
    bsln_10: {
      origin:
        "+0.5 と同じ手法群で、増加量が異なります。{jamnick}は +0.5、+1.0、+1.5 mmol/L を別の基準として比較しました。",
      interpretation:
        "+1.0 は +0.5 とは異なる基準であり、増加量が大きいだけで第二の生理学的閾値とはいえません。ベースラインの定義を変えると結果も変わります。",
    },
    log_log: {
      origin:
        "{beaver}は乳酸と酸素摂取量の関係を両対数軸で分析しました。{bishop}などの自転車研究ではパワーが用いられ、本ツールではテスト強度を使用します。",
      interpretation:
        "運動ステージが5段階以上あり、2本の直線の交点が測定範囲内にある必要があります。強度を横軸にする実装は、元の酸素摂取量テストの再現とは異なります。",
    },
    dmax: {
      origin:
        "{cheng}が Dmax を提案しました。近似カーブと、その両端を結ぶ直線との最大距離を求めます。",
      interpretation:
        "測定範囲と近似に依存します。本ツールでは基準線の両端を3次近似カーブ上に置くため、最初や最後のステージを変えると推定値も変わり得ます。",
    },
    moddmax: {
      origin:
        "{bishop}は前半の平坦な部分の影響を減らすため、Dmax の基準線の始点を変更しました。{heuberger}は 0.4 mmol/L 以上の上昇を基準としています。",
      interpretation:
        "本ツールはちょうど 0.4 mmol/L の上昇も含め、始点と終点の実測乳酸を使います。{jamnick}の記述は >0.4 であり、ここでは Heuberger の等号を含む基準を採用しています。",
    },
    log_poly_moddmax: {
      origin:
        "{jamnick}が提案した組み合わせです。Log-log で始点の強度を決め、3次近似カーブに修正 Dmax を適用します。",
      interpretation:
        "同研究で MLSS に最も近かったのは、訓練を積んだ男性サイクリスト17人の4分ステージでした。あらゆるランニング・自転車プロトコルでの妥当性を示すものではなく、有効な Log-log の結果も必要です。",
    },
  },
};

export function getLactateMethodContext(lang: string): MethodContextCopy {
  return lang === "zh"
    ? zh
    : lang === "zh-hant"
      ? zhHant
      : lang === "ja"
        ? ja
        : en;
}
