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

const ko: MethodContextCopy = {
  originLabel: "연구 출처",
  interpretationLabel: "적용 및 한계",
  referencesTitle: "참고 문헌 및 구현 근거",
  introduction:
    "이 방법들은 동일한 테스트에서 서로 다른 특징을 식별합니다. 방법의 명칭만으로 개인의 LT1, LT2 또는 최대 젖산 항정 상태(MLSS)가 확정되는 것은 아니며, 단계 시간, 채혈 방식, 연구 대상 집단이 해석에 영향을 미칩니다.",
  implementation:
    "계산 결과는 아래 고정 버전의 lactater와 대조 검증했습니다. 참조 소프트웨어와 일치한다고 해서 독립적인 생리학적 타당성이 입증되는 것은 아닙니다.",
  methods: {
    obla_2: {
      origin:
        "고정 농도 계열에 속합니다. {jamnick}은 사이클링 점증 부하 테스트에서 비교한 여러 고정 농도 기준에 2 mmol/L를 포함했습니다.",
      interpretation:
        "표준화된 비교 지점으로 유용합니다. 고정된 2 mmol/L 농도가 개인의 제1 역치를 확정하지는 않으므로, 일관된 프로토콜의 테스트끼리 비교해야 합니다.",
    },
    obla_4: {
      origin:
        "4 mmol/L 기준은 현대적인 자동 곡선 분석 도구가 등장하기 훨씬 이전부터 {kindermann}이 논의했고 {heck}이 검토했습니다.",
      interpretation:
        "관례적인 농도 기준이며 보편적인 LT2나 실측 MLSS가 아닙니다. 개인의 젖산 수준과 테스트 설계에 따라 추정치가 실제 경계보다 높거나 낮을 수 있습니다.",
    },
    bsln_05: {
      origin:
        "기준선 대비 증가량 방식입니다. {jamnick}이 이 계열을 비교하며 초기 연구 배경으로 {berg}과 {zoladz}을 인용했습니다.",
      interpretation:
        "기준선 샘플과 측정 변동에 민감합니다. 이 도구는 초기 단계들을 평균하지 않고 안정 시 젖산이 있으면 이를, 없으면 첫 번째 운동 단계를 기준선으로 사용합니다.",
    },
    bsln_10: {
      origin:
        "같은 기준선 대비 증가량 계열이며 증가폭이 더 큽니다. {jamnick}은 +0.5, +1.0, +1.5 mmol/L를 별도의 기준으로 비교했습니다.",
      interpretation:
        "+1.0 결과는 +0.5와 다른 기준일 뿐 제2 생리학적 역치를 입증하지 않습니다. 기준선 정의가 바뀌면 추정치도 달라집니다.",
    },
    log_log: {
      origin:
        "{beaver}는 로그 좌표축에서 젖산과 산소섭취량의 관계를 분석했습니다. {bishop}을 포함한 이후 사이클링 연구에서는 파워를 사용했으며, 이 도구는 테스트 강도를 사용합니다.",
      interpretation:
        "최소 5개의 운동 단계와 테스트 범위 내의 교점이 필요합니다. 강도를 축으로 사용하는 방식은 원래의 산소섭취량 테스트 프로토콜을 그대로 재현하는 것이 아닙니다.",
    },
    dmax: {
      origin:
        "{cheng}이 Dmax를 제안했습니다. 적합된 반응 곡선과 양 끝점을 잇는 직선 사이의 최대 거리를 찾습니다.",
      interpretation:
        "테스트 범위와 곡선 적합에 따라 달라집니다. 여기서는 두 기준 끝점이 모두 3차 곡선 위에 놓이므로 첫 단계나 마지막 단계가 바뀌면 추정치가 이동할 수 있습니다.",
    },
    moddmax: {
      origin:
        "{bishop}은 초반 평탄 구간의 영향을 줄이기 위해 Dmax 기준선의 시작점을 수정했습니다. 이후 {heuberger}는 최소 0.4 mmol/L 상승 기준을 제시했습니다.",
      interpretation:
        "이 도구는 정확히 0.4 mmol/L 상승하는 경우를 포함하며 실측 시작/종료 젖산값을 사용합니다. {jamnick}은 >0.4로 기술했지만 여기서는 Heuberger의 등호 포함 규칙을 따릅니다.",
    },
    log_poly_moddmax: {
      origin:
        "{jamnick}이 도입한 결합 방식입니다. Log-log로 시작 강도를 정한 뒤 3차 곡선에서 수정 Dmax를 계산합니다.",
      interpretation:
        "해당 연구에서 MLSS에 가장 근접한 추정치는 훈련된 남성 사이클리스트 17명의 4분 단계 프로토콜에서 나왔습니다. 이 결과가 모든 러닝이나 사이클링 프로토콜을 검증하는 것은 아니며, 유효한 Log-log 결과가 필요합니다.",
    },
  },
};

const de: MethodContextCopy = {
  originLabel: "Ursprung",
  interpretationLabel: "Anwendung und Grenzen",
  referencesTitle: "Referenzen und Implementierung",
  introduction:
    "Diese Methoden erfassen unterschiedliche Merkmale desselben Tests. Ihre Namen definieren weder individuell LT1, LT2 noch das maximale Laktat-Steady-State (MLSS); Stufendauer, Probenahme und untersuchte Population beeinflussen die Einordnung.",
  implementation:
    "Die Berechnungen werden gegen die unten angegebene feste Version von lactater geprüft. Die Übereinstimmung mit einer Referenzsoftware ersetzt keine eigenständige physiologische Validierung.",
  methods: {
    obla_2: {
      origin:
        "Teil der Familie fester Laktatkonzentrationen. {jamnick} schloss 2 mmol/L in den Vergleich mehrerer fester Konzentrationen bei Rad-Stufentests ein.",
      interpretation:
        "Nützlich als standardisierter Vergleichspunkt. Eine feste Konzentration von 2 mmol/L legt nicht individuell die erste Schwelle fest; vergleiche nur Tests mit einheitlichem Protokoll.",
    },
    obla_4: {
      origin:
        "Das 4-mmol/L-Kriterium wurde bereits von {kindermann} diskutiert und von {heck} untersucht – lange vor modernen automatisierten Kurven-Tools.",
      interpretation:
        "Eine konventionelle Konzentration, keine allgemeingültige LT2 und kein gemessenes MLSS. Individuelle Laktatwerte und Testdesign können diese Schätzung über oder unter die eigentliche Grenze legen.",
    },
    bsln_05: {
      origin:
        "Ein Basislinie-plus-Kriterium. {jamnick} verglich diese Methodenfamilie und führte {berg} sowie {zoladz} als früheren Hintergrund an.",
      interpretation:
        "Empfindlich gegenüber der Basisprobe und Messschwankungen. Dieses Tool nutzt den Ruhelaktatwert, sofern vorhanden, sonst die erste Belastungsstufe – es mittelt keine frühen Stufen.",
    },
    bsln_10: {
      origin:
        "Dieselbe Basislinie-plus-Familie mit größerem Anstieg. {jamnick} verglich +0,5, +1,0 und +1,5 mmol/L als eigenständige Kriterien.",
      interpretation:
        "Ein +1,0-Wert ist ein anderes Kriterium als +0,5, kein Nachweis einer zweiten physiologischen Schwelle. Eine andere Definition der Basislinie verschiebt die Schätzung.",
    },
    log_log: {
      origin:
        "{beaver} analysierte Laktat gegenüber der Sauerstoffaufnahme auf logarithmischen Achsen. Spätere Radstudien wie {bishop} nutzten Leistung; dieses Tool verwendet die Testintensität.",
      interpretation:
        "Erfordert mindestens fünf Belastungsstufen und einen Schnittpunkt im getesteten Bereich. Die Nutzung der Intensität bildet das ursprüngliche Sauerstoffaufnahme-Protokoll nicht eins zu eins ab.",
    },
    dmax: {
      origin:
        "{cheng} schlug Dmax vor: Bestimmung des größten Abstands zwischen einer angepassten Kurve und der Verbindungsgeraden ihrer Endpunkte.",
      interpretation:
        "Abhängig vom getesteten Bereich und der Kurvenanpassung. Hier liegen beide Referenz-Endpunkte auf der kubischen Kurve; eine Änderung der ersten oder letzten Stufe kann den Wert verschieben.",
    },
    moddmax: {
      origin:
        "{bishop} veränderte den Startpunkt der Dmax-Referenzlinie, um den Einfluss flacher Anfangsstufen zu verringern. {heuberger} beschrieb später einen Anstieg von mindestens 0,4 mmol/L.",
      interpretation:
        "Dieses Tool schließt einen exakten Anstieg von 0,4 mmol/L ein und nutzt gemessene Start- und End-Laktatwerte. {jamnick} beschreibt >0,4; die inklusive Regel folgt der Formulierung nach Heuberger.",
    },
    log_poly_moddmax: {
      origin:
        "{jamnick} führte diese Kombination ein: eine Log-log-Startintensität gefolgt von einer modifizierten Dmax-Berechnung auf einer kubischen Kurve.",
      interpretation:
        "Ihre engste MLSS-Schätzung basierte auf 4-Minuten-Stufen bei 17 trainierten männlichen Radfahrern. Das validiert nicht jedes Lauf- oder Radprotokoll. Ein gültiges Log-log-Ergebnis ist erforderlich.",
    },
  },
};

const fr: MethodContextCopy = {
  originLabel: "Origine",
  interpretationLabel: "Application et limites",
  referencesTitle: "Références et implémentation",
  introduction:
    "Ces méthodes identifient différentes caractéristiques d'un même test. Leur nom n'établit pas à lui seul la LT1, la LT2 ou l'état stable maximal de lactate (MLSS) d'un athlète ; la durée des paliers, le prélèvement et la population étudiée influencent l'interprétation.",
  implementation:
    "Les calculs sont vérifiés par rapport à la version fixe de lactater indiquée ci-dessous. La concordance avec un logiciel de référence ne constitue pas une validation physiologique indépendante.",
  methods: {
    obla_2: {
      origin:
        "Fait partie de la famille des concentrations fixes. {jamnick} a inclus 2 mmol/L parmi les concentrations comparées lors de tests incrémentaux à vélo.",
      interpretation:
        "Utile comme repère de comparaison standardisé. Une concentration fixe de 2 mmol/L ne définit pas le premier seuil de chaque athlète ; comparez des tests réalisés avec le même protocole.",
    },
    obla_4: {
      origin:
        "Le critère de 4 mmol/L a été discuté par {kindermann} et examiné par {heck}, bien avant les outils modernes d'analyse automatisée de courbes.",
      interpretation:
        "Une concentration conventionnelle, pas une LT2 universelle ni un MLSS mesuré. Les niveaux individuels de lactate et le protocole de test peuvent placer cette estimation au-dessus ou en dessous de la limite pertinente.",
    },
    bsln_05: {
      origin:
        "Un critère basé sur une hausse au-dessus de la ligne de base. {jamnick} a comparé cette famille en citant {berg} et {zoladz} comme travaux antérieurs.",
      interpretation:
        "Sensible à l'échantillon de base et à la variabilité de mesure. Cet outil utilise le lactate de repos lorsqu'il est présent, sinon le premier palier d'effort, sans faire la moyenne des premiers paliers.",
    },
    bsln_10: {
      origin:
        "Même famille basée sur la ligne de base, avec un incrément plus élevé. {jamnick} a comparé +0,5, +1,0 et +1,5 mmol/L comme critères distincts.",
      interpretation:
        "Un résultat à +1,0 constitue un critère différent de +0,5, et non la preuve d'un second seuil physiologique. Modifier la définition de la ligne de base modifie aussi l'estimation.",
    },
    log_log: {
      origin:
        "{beaver} a analysé le lactate en fonction de la consommation d'oxygène sur des axes logarithmiques. Des études ultérieures en cyclisme, dont {bishop}, ont utilisé la puissance ; cet outil utilise l'intensité du test.",
      interpretation:
        "Nécessite au moins cinq paliers d'effort et une intersection dans la plage testée. L'utilisation de l'intensité ne reproduit pas le protocole original basé sur la consommation d'oxygène.",
    },
    dmax: {
      origin:
        "{cheng} a proposé Dmax : trouver la plus grande distance entre une courbe ajustée et la droite reliant ses deux extrémités.",
      interpretation:
        "Dépend de la plage testée et de l'ajustement. Ici, les deux extrémités de référence se trouvent sur la courbe cubique ; modifier le premier ou le dernier palier peut déplacer l'estimation.",
    },
    moddmax: {
      origin:
        "{bishop} a modifié le début de la ligne de référence Dmax pour réduire l'influence des premiers paliers plats. {heuberger} a ensuite décrit une hausse d'au moins 0,4 mmol/L.",
      interpretation:
        "Cet outil inclut une hausse exacte de 0,4 mmol/L et utilise les valeurs mesurées de début et de fin. {jamnick} décrit >0,4 ; la règle inclusive suit la formulation de Heuberger.",
    },
    log_poly_moddmax: {
      origin:
        "{jamnick} a introduit cette combinaison : une intensité de départ issue de Log-log suivie d'un calcul Dmax modifié sur une courbe cubique.",
      interpretation:
        "Leur estimation la plus proche du MLSS reposait sur des paliers de 4 minutes chez 17 cyclistes masculins entraînés. Ce résultat ne valide pas tous les protocoles de course ou de cyclisme. Un résultat Log-log valide est requis.",
    },
  },
};

const es: MethodContextCopy = {
  originLabel: "Origen",
  interpretationLabel: "Aplicación y límites",
  referencesTitle: "Referencias e implementación",
  introduction:
    "Estos métodos identifican distintas características de la misma prueba. Sus nombres no establecen por sí solos el LT1, el LT2 ni el máximo estado estable de lactato (MLSS) de un individuo; la duración de las etapas, el muestreo y la población estudiada afectan la interpretación.",
  implementation:
    "Los cálculos se verifican contra la versión fija de lactater indicada abajo. Coincidir con un software de referencia no constituye una validación fisiológica independiente.",
  methods: {
    obla_2: {
      origin:
        "Forma parte de la familia de concentraciones fijas. {jamnick} incluyó 2 mmol/L entre las concentraciones comparadas en pruebas incrementales de ciclismo.",
      interpretation:
        "Útil como punto de comparación estandarizado. Una concentración fija de 2 mmol/L no establece el primer umbral individual; compara pruebas con protocolos consistentes.",
    },
    obla_4: {
      origin:
        "El criterio de 4 mmol/L fue discutido por {kindermann} y examinado por {heck}, mucho antes de las herramientas modernas de análisis automático de curvas.",
      interpretation:
        "Es una concentración convencional, no un LT2 universal ni un MLSS medido. Los niveles individuales de lactato y el diseño de la prueba pueden situar esta estimación por encima o por debajo del límite relevante.",
    },
    bsln_05: {
      origin:
        "Un criterio de incremento sobre la línea base. {jamnick} comparó esta familia y citó a {berg} y {zoladz} como antecedentes previos.",
      interpretation:
        "Sensible a la muestra base y a la variación de medición. Esta herramienta utiliza el lactato en reposo si está disponible, o de lo contrario la primera etapa de ejercicio, sin promediar etapas iniciales.",
    },
    bsln_10: {
      origin:
        "La misma familia de incremento sobre la línea base, con un aumento mayor. {jamnick} comparó +0,5, +1,0 y +1,5 mmol/L como criterios separados.",
      interpretation:
        "Un resultado de +1,0 es un criterio distinto de +0,5, no prueba de un segundo umbral fisiológico. Cambiar la definición de la línea base también cambia la estimación.",
    },
    log_log: {
      origin:
        "{beaver} analizó el lactato frente al consumo de oxígeno en ejes logarítmicos. Aplicaciones posteriores en ciclismo, incluida {bishop}, usaron potencia; esta herramienta usa la intensidad de la prueba.",
      interpretation:
        "Requiere al menos cinco etapas de ejercicio y una intersección dentro del rango evaluado. Usar la intensidad no reproduce el protocolo original de consumo de oxígeno.",
    },
    dmax: {
      origin:
        "{cheng} propuso Dmax: hallar la mayor separación entre una curva ajustada y la recta que une sus extremos.",
      interpretation:
        "Depende del rango evaluado y del ajuste. Aquí ambos extremos de referencia están sobre la curva cúbica; cambiar la primera o la última etapa puede desplazar la estimación.",
    },
    moddmax: {
      origin:
        "{bishop} modificó el inicio de la línea de referencia de Dmax para reducir la influencia de las primeras etapas planas. {heuberger} describió después un aumento de al menos 0,4 mmol/L.",
      interpretation:
        "Esta herramienta incluye un aumento exacto de 0,4 mmol/L y usa el lactato medido inicial y final. {jamnick} describe >0,4; la regla inclusiva sigue la formulación de Heuberger.",
    },
    log_poly_moddmax: {
      origin:
        "{jamnick} introdujo esta combinación: una intensidad inicial por Log-log seguida de un cálculo Dmax modificado sobre una curva cúbica.",
      interpretation:
        "Su estimación más cercana al MLSS utilizó etapas de 4 minutos en 17 ciclistas varones entrenados. Ese hallazgo no valida todos los protocolos de carrera o ciclismo. Se requiere un resultado válido de Log-log.",
    },
  },
};

const it: MethodContextCopy = {
  originLabel: "Origine",
  interpretationLabel: "Applicazione e limiti",
  referencesTitle: "Riferimenti e implementazione",
  introduction:
    "Questi metodi identificano caratteristiche diverse dello stesso test. I loro nomi non determinano di per sé LT1, LT2 o lo stato stazionario massimo del lattato (MLSS) di un individuo; durata degli stadi, campionamento e popolazione studiata influenzano l'interpretazione.",
  implementation:
    "I calcoli sono verificati rispetto alla versione fissa di lactater indicata sotto. La corrispondenza con un software di riferimento non costituisce una validazione fisiologica indipendente.",
  methods: {
    obla_2: {
      origin:
        "Fa parte della famiglia delle concentrazioni fisse. {jamnick} ha incluso 2 mmol/L tra le concentrazioni confrontate nei test incrementali di ciclismo.",
      interpretation:
        "Utile come punto di confronto standardizzato. Una concentrazione fissa di 2 mmol/L non stabilisce la prima soglia individuale; confronta test svolti con protocolli coerenti.",
    },
    obla_4: {
      origin:
        "Il criterio di 4 mmol/L è stato discusso da {kindermann} ed esaminato da {heck}, ben prima dei moderni strumenti automatizzati per le curve.",
      interpretation:
        "È una concentrazione convenzionale, non una LT2 universale né un MLSS misurato. I livelli individuali di lattato e il disegno del test possono collocare questa stima sopra o sotto il limite rilevante.",
    },
    bsln_05: {
      origin:
        "Un criterio basato sull'aumento rispetto alla linea di base. {jamnick} ha confrontato questa famiglia citando {berg} e {zoladz} come riferimenti precedenti.",
      interpretation:
        "Sensibile al campione di base e alla variabilità di misura. Questo strumento utilizza il lattato a riposo se presente, altrimenti il primo stadio di esercizio, senza fare la media degli stadi iniziali.",
    },
    bsln_10: {
      origin:
        "La stessa famiglia di incremento dalla linea di base, con un aumento maggiore. {jamnick} ha confrontato +0,5, +1,0 e +1,5 mmol/L come criteri distinti.",
      interpretation:
        "Un risultato a +1,0 è un criterio diverso da +0,5, non la prova di una seconda soglia fisiologica. Cambiare la definizione della linea di base modifica anche la stima.",
    },
    log_log: {
      origin:
        "{beaver} ha analizzato il lattato rispetto al consumo di ossigeno su assi logaritmici. Applicazioni successive nel ciclismo, tra cui {bishop}, hanno usato la potenza; questo strumento usa l'intensità del test.",
      interpretation:
        "Richiede almeno cinque stadi di esercizio e un'intersezione all'interno dell'intervallo testato. L'uso dell'intensità non riproduce il protocollo originale basato sul consumo di ossigeno.",
    },
    dmax: {
      origin:
        "{cheng} ha proposto Dmax: individuare la massima separazione tra una curva adattata e la retta che collega i suoi estremi.",
      interpretation:
        "Dipende dall'intervallo testato e dall'adattamento. Qui entrambi gli estremi di riferimento giacciono sulla curva cubica; cambiare il primo o l'ultimo stadio può spostare la stima.",
    },
    moddmax: {
      origin:
        "{bishop} ha modificato l'inizio della linea di riferimento Dmax per ridurre l'influenza degli stadi iniziali piatti. {heuberger} ha poi descritto un aumento di almeno 0,4 mmol/L.",
      interpretation:
        "Questo strumento include un aumento esatto di 0,4 mmol/L e usa il lattato misurato iniziale e finale. {jamnick} indica >0,4; la regola inclusiva segue la formulazione di Heuberger.",
    },
    log_poly_moddmax: {
      origin:
        "{jamnick} ha introdotto questa combinazione: un'intensità iniziale da Log-log seguita da un calcolo Dmax modificato su una curva cubica.",
      interpretation:
        "La stima più vicina al MLSS nel loro studio ha usato stadi da 4 minuti in 17 ciclisti uomini allenati. Quel risultato non valida ogni protocollo di corsa o ciclismo. È richiesto un risultato Log-log valido.",
    },
  },
};

const ptBR: MethodContextCopy = {
  originLabel: "Origem",
  interpretationLabel: "Aplicação e limites",
  referencesTitle: "Referências e implementação",
  introduction:
    "Estes métodos identificam características diferentes do mesmo teste. Seus nomes não estabelecem o LT1, o LT2 nem o máximo estado estável de lactato (MLSS) de um indivíduo; a duração dos estágios, a coleta e a população estudada afetam a interpretação.",
  implementation:
    "Os cálculos são verificados em relação à versão fixa do lactater abaixo. Coincidir com um software de referência não representa uma validação fisiológica independente.",
  methods: {
    obla_2: {
      origin:
        "Faz parte da família de concentrações fixas. {jamnick} incluiu 2 mmol/L entre as concentrações comparadas em testes incrementais de ciclismo.",
      interpretation:
        "Útil como ponto de comparação padronizado. Uma concentração fixa de 2 mmol/L não define o primeiro limiar individual; compare testes com protocolos consistentes.",
    },
    obla_4: {
      origin:
        "O critério de 4 mmol/L foi discutido por {kindermann} e examinado por {heck}, muito antes das ferramentas modernas de análise automatizada de curvas.",
      interpretation:
        "É uma concentração convencional, não um LT2 universal nem um MLSS medido. Os níveis individuais de lactato e o desenho do teste podem colocar essa estimativa acima ou abaixo do limite relevante.",
    },
    bsln_05: {
      origin:
        "Um critério de acréscimo sobre a linha de base. {jamnick} comparou essa família e citou {berg} e {zoladz} como base anterior.",
      interpretation:
        "Sensível à amostra de base e à variação de medição. Esta ferramenta usa o lactato de repouso quando presente, ou o primeiro estágio de exercício, sem calcular a média dos estágios iniciais.",
    },
    bsln_10: {
      origin:
        "A mesma família de acréscimo sobre a linha de base, com incremento maior. {jamnick} comparou +0,5, +1,0 e +1,5 mmol/L como critérios separados.",
      interpretation:
        "Um resultado de +1,0 é um critério diferente de +0,5, não prova de um segundo limiar fisiológico. Alterar a definição da linha de base também altera a estimativa.",
    },
    log_log: {
      origin:
        "{beaver} analisou o lactato em função do consumo de oxigênio em eixos logarítmicos. Aplicações posteriores no ciclismo, incluindo {bishop}, usaram potência; esta ferramenta usa a intensidade do teste.",
      interpretation:
        "Requer pelo menos cinco estágios de exercício e uma interseção dentro da faixa testada. Usar intensidade não reproduz o protocolo original de consumo de oxigênio.",
    },
    dmax: {
      origin:
        "{cheng} propôs o Dmax: localizar a maior separação entre uma curva ajustada e a reta que liga seus extremos.",
      interpretation:
        "Depende da faixa testada e do ajuste. Aqui ambos os extremos de referência ficam sobre a curva cúbica; alterar o primeiro ou o último estágio pode deslocar a estimativa.",
    },
    moddmax: {
      origin:
        "{bishop} modificou o início da linha de referência do Dmax para reduzir a influência dos primeiros estágios planos. {heuberger} descreveu depois um aumento de pelo menos 0,4 mmol/L.",
      interpretation:
        "Esta ferramenta inclui um aumento exato de 0,4 mmol/L e usa os valores medidos inicial e final de lactato. {jamnick} descreve >0,4; a regra inclusiva segue a formulação de Heuberger.",
    },
    log_poly_moddmax: {
      origin:
        "{jamnick} introduziu esta combinação: uma intensidade inicial via Log-log seguida por um cálculo Dmax modificado em uma curva cúbica.",
      interpretation:
        "Sua estimativa mais próxima do MLSS usou estágios de 4 minutos em 17 ciclistas homens treinados. Esse achado não valida todo protocolo de corrida ou ciclismo. É necessário um resultado Log-log válido.",
    },
  },
};

export function getLactateMethodContext(lang: string): MethodContextCopy {
  switch (lang) {
    case "zh":
      return zh;
    case "zh-hant":
      return zhHant;
    case "ja":
      return ja;
    case "ko":
      return ko;
    case "de":
      return de;
    case "fr":
      return fr;
    case "es":
      return es;
    case "it":
      return it;
    case "pt-BR":
      return ptBR;
    default:
      return en;
  }
}
