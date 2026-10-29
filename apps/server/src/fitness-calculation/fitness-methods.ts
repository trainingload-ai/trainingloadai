import type { FitnessMetric, FitnessSport } from '@shared/fitness-assessment';
export type FitnessMethod = {
  id: string;
  version: string;
  policyVersion: string;
  metrics: FitnessMetric[];
  sports: FitnessSport[];
  recipe:
    | 'HR_OBSERVATION'
    | 'HR_TEST_SEGMENT'
    | 'POWER_DURATION'
    | 'DISTANCE_TIME'
    | 'PACE_5K'
    | 'PERFORMANCE_VDOT'
    | 'ACTIVITY_VO2'
    | 'OBSERVED_HR'
    | 'DAILY_RESTING_HR'
    | 'UNAVAILABLE';
  unavailableReason?: string;
  description: string;
  /** 模型为何能近似目标指标；算法公式不等同于生理定义。 */
  rationale: string;
  /** 实际训练中的假设、偏差和结果含义；不是额外的执行门槛。 */
  interpretation: string[];
  /** 当前计算实现的输入条件，不代表该指标的所有可用估算方法。 */
  requirements: string[];
  sources: string[];
  application: 'USER_CONFIRMATION' | 'UNAVAILABLE';
};
const METHODS: readonly FitnessMethod[] = [
  {
    id: 'lthr-activity-observation',
    version: '1',
    policyVersion: '1',
    metrics: ['LTHR'],
    sports: ['RUN', 'CYCLING'],
    recipe: 'HR_OBSERVATION',
    description:
      'Estimate LTHR from the requested ordinary activity or activity range. Automatically select a quality-qualified 30-minute window and compute its final 20-minute time-weighted HR. No maximal-effort claim or test confirmation is required.',
    rationale:
      "This reuses the product's passive LTHR observation algorithm: scan complete 30-minute windows at 30-second intervals and select the highest quality-qualified final-20-minute mean. Sustained heart-rate observations provide a provisional training reference; borrowing this window structure does not make ordinary training a validated threshold test.",
    interpretation: [
      'Use this calculator for everyday training, including a 7K or 10K run with sufficient heart-rate coverage. Distance, race status, maximal effort and a steadily rising heart rate are not execution requirements. The calculator selects the window within the requested source; the athlete does not need to identify a test start.',
      'The result is an activity-based LTHR estimate, not proof of physiological threshold. Easy effort may understate it; heat, fatigue, pauses and sensor effects can alter the relationship. A short finishing surge or peak HR cannot establish that true LTHR is above that heart rate or above an old setting.',
      'A single valid activity is enough for this requested calculation. The separate background pipeline may require corroborating activities for automatic updates; that does not prevent displaying this estimate or the athlete choosing to adopt it.',
      "Compare with the current same-sport reference and identify its source. A fallback zone boundary derived from MaxHR is not a previously measured or saved LTHR. Higher bpm is not automatically better, and a lower estimate from ordinary training does not prove fitness loss. Adoption remains the athlete's decision.",
    ],
    requirements: [
      'At least one complete 1800-second HR window in the requested READY activities; no user-specified segment is necessary',
      'Ordered original timestamps; HR coverage >=95% in both windows; no gap >30 seconds',
    ],
    sources: [],
    application: 'USER_CONFIRMATION',
  },
  {
    id: 'lthr-30-minute',
    version: '1',
    policyVersion: '2',
    metrics: ['LTHR'],
    sports: ['RUN', 'CYCLING'],
    recipe: 'HR_TEST_SEGMENT',
    description:
      '30-minute solo time trial, time-weighted HR over its final 20 minutes. Field estimate, not a laboratory measurement.',
    rationale:
      'LTHR is a heart-rate reference associated with sustained threshold intensity. This particular field-test proxy uses the final 20 minutes of a 30-minute sustained solo effort to reduce the influence of the initial heart-rate rise. Its test protocol explains the proxy; it is not the definition of LTHR or the only source of evidence about it.',
    interpretation: [
      'For an ordinary activity, lthr-activity-observation runs a fresh estimate from its original HR recording without test confirmation. This test recipe is for an actual protocol-specific assessment. Saved passive observations or estimates are existing evidence, not proof that a fresh calculation used the requested activity.',
      'The confirmed test protocol is specific to this registered recipe. An ordinary session is not that test, but its duration, stable work segments, reported effort and heart-rate response still have analytical value. Missing test confirmation limits this recipe, rather than establishing that LTHR cannot be estimated from daily training.',
      'Heart rate responds to effort and conditions; a high or steady value alone does not establish threshold. Lower effort may understate the reference, while heat, fatigue or sensor error can affect it differently. A comparison with the current same-sport LTHR is a difference in reference values, not automatically an improvement when bpm rises.',
      'The MaxHR reference required by the adoption path is a separate setting check, not a request to perform a maximal-heart-rate test. Calculation, interpretation and the athlete deciding to adopt a reference are distinct.',
    ],
    requirements: [
      'Explicit test segment and user-confirmed actual protocol',
      '1800 continuous seconds; HR coverage >=95% in both windows; no gap >30 seconds',
    ],
    sources: ['https://joefrieltraining.com/determining-your-lthr/'],
    application: 'USER_CONFIRMATION',
  },
  {
    id: 'cycling-extended-cp',
    version: '1',
    policyVersion: '2',
    metrics: ['CP', 'FTP', 'W_PRIME', 'P_MAX'],
    sports: ['CYCLING'],
    recipe: 'POWER_DURATION',
    description:
      'Extended CP model fitted to measured power-duration evidence. FTP=0.95*CP is an unvalidated product mapping; outputs can be explicitly adopted as user-selected estimates.',
    rationale:
      'Power sustainable over a short interval differs from power sustainable over a long one. The extended model fits that recorded power-duration relationship to estimate CP, work capacity above CP (W-prime), and short-duration P_MAX. This implementation also derives FTP as 0.95*CP; CP and FTP describe related but non-identical quantities, so that mapping remains a product approximation.',
    interpretation: [
      'A normal ride can supply several rolling-duration power peaks. Distinct durations do not mean separate maximal tests or separate activities; valid windows within the requested activity are usable inputs. Best recorded power means best within the available recording, not proven physiological maximum.',
      'Measured power, duration coverage and a converged fit determine whether this calculator can run. All-out effort is not an additional gate. A fit from ordinary riding describes demonstrated performance; unused capacity and uneven effort across durations affect the parameters, especially W-prime and P_MAX, and do not imply one exact correction or a guaranteed lower bound for every parameter.',
      'The computed values can be compared with the current same-sport references even if the ride was not maximal. Higher estimates may support the athlete choosing a new reference; lower estimates from easier riding alone do not establish lost fitness. Report each value and difference with the evidence context, leaving adoption to the athlete.',
    ],
    requirements: [
      'Measured power from the active primary source',
      'At least five original durations spanning 30–60, 60–180 and 600–1200 seconds',
      'Finite, converged fit',
    ],
    sources: [
      'https://github.com/GoldenCheetah/GoldenCheetah',
      'https://pubmed.ncbi.nlm.nih.gov/33551839/',
    ],
    application: 'USER_CONFIRMATION',
  },
  {
    id: 'running-extended-cp',
    version: '1',
    policyVersion: '2',
    metrics: ['CP', 'FTP', 'W_PRIME', 'P_MAX'],
    sports: ['RUN'],
    recipe: 'POWER_DURATION',
    description:
      'Existing extended power model on measured running power; model and FTP mapping are estimates, never transfer cycling thresholds to running.',
    rationale:
      'The extended power-duration model summarizes running-power observations across short and sustained durations into CP, W-prime and P_MAX. FTP is the same approximate 0.95*CP mapping used by this implementation; it is not a separately measured running threshold.',
    interpretation: [
      'Recorded rolling power peaks from a normal run can satisfy the duration inputs. The model does not require a race, separate sprint tests or evidence that every window was maximal; once its signal and fit requirements are met, it can produce estimates from the requested run.',
      'Non-maximal and unevenly distributed efforts affect how representative the fitted parameters are. Running power is device-dependent, so comparisons are most informative within the same sport and a comparable measurement source; cycling watts are not interchangeable running references.',
      'A higher estimate can still be useful when the athlete held back. Present the new values and their differences from current running references, explain the model and source limitations, and let the athlete decide whether to adopt them.',
    ],
    requirements: [
      'Measured running power, at least five original durations spanning 30–60, 60–180 and 600–1200 seconds',
      'Finite converged fit',
    ],
    sources: ['https://github.com/GoldenCheetah/GoldenCheetah'],
    application: 'USER_CONFIRMATION',
  },
  {
    id: 'critical-speed',
    version: '1',
    policyVersion: '2',
    metrics: ['CS'],
    sports: ['RUN', 'CYCLING', 'SWIM'],
    recipe: 'DISTANCE_TIME',
    description:
      'Existing weighted distance = CS*time + D-prime model; swimming CSS is CS in speed units. Not a verified maximal test.',
    rationale:
      'Fitting distance against elapsed time separates a sustained-speed term (CS, the slope) from a finite distance term (D-prime, the intercept). For swimming the resulting speed is represented as CSS. The fitted relationship estimates a performance parameter, not a direct lactate measurement or an interchangeable TP value.',
    interpretation: [
      'The distance-time observations can come from normal activities; race status and verified maximal effort are not execution requirements. This implementation requires three independent activities and distances to fit its model, which is a sampling constraint rather than a demand for three new all-out tests.',
      'One requested activity may lack enough independent observations for this fitter while still supporting pace observations or another explained estimate. A good R-squared establishes agreement with the fitted relationship, not that the athlete reached maximal capacity. Terrain, wind, stops and uneven effort can alter the fit.',
      "Compare with the same-sport CS/CSS reference in consistent units: higher speed means faster, while lower seconds per distance means faster. The difference informs a possible reference update even without maximal effort; adoption remains the athlete's decision.",
    ],
    requirements: [
      'At least three independent activities and distances',
      'Running efforts 120–900 seconds, CS >=1.8 m/s; positive D-prime and R-squared >=0.95',
      'Exclude walking/hiking from RUN',
    ],
    sources: [],
    application: 'USER_CONFIRMATION',
  },
  {
    id: 'running-5k-threshold-pace',
    version: '1',
    policyVersion: '2',
    metrics: ['TP'],
    sports: ['RUN'],
    recipe: 'PACE_5K',
    description:
      'Estimate TP with the existing recorded 5K pace +20 seconds/km heuristic. Output s/km; stored TP uses m/s and must be converted for comparison.',
    rationale:
      'Threshold training pace approximates a sustained metabolic intensity, commonly related to roughly 50–60-minute race effort, not simply the average of any run lasting an hour. A shorter race is typically faster, so this heuristic adds time per kilometre to approximate that longer sustainable effort. The fixed 20-second offset is a rough product heuristic, not a universal physiological constant or the definition of threshold.',
    interpretation: [
      'Computability and representativeness are different. Once the execution inputs are available, this formula produces an estimate; maximal effort, race status and perfect pacing are not additional execution requirements. They affect how closely the estimate reflects current capacity.',
      'Asking to use a particular activity normally selects the data source, not a requirement to use its whole-distance average. A 7K or 10K activity can supply the 5K window this estimator needs, including its recorded best 5K, without requiring another workout or a separate choice from the athlete. The word best describes a window statistic, not proof of maximal effort or a requirement to set a personal best. The result can identify which activity and window supplied the input.',
      'Other distances also contain evidence about sustainable pace through their duration, pace, reported effort and conditions. A missing 5K peak only prevents this particular calculator from executing; it does not make the activity unusable for a reasoned estimate through another applicable performance relationship. The fixed +20-second offset belongs to 5K pace, so applying it directly to a whole 7K or 10K average would be a different, unjustified use of this formula.',
      'Non-maximal running can yield a slower estimate than current capacity without making the estimate useless. The amount of unused capacity is unknown, so no exact correction follows from having held back. Pace consistency, heart-rate behavior, terrain, stops and recent comparable efforts help interpret the estimate; none alone measures threshold.',
      'Comparison with the existing TP gives the estimate practical context: lower seconds/km means faster, whereas higher m/s means faster. For example, an estimate of 5:20/km versus an existing 5:40/km is 20 seconds/km faster even if the effort was not maximal. That can inform the athlete choosing a new reference; it does not prove a measured physiological improvement. The estimate, difference and uncertainty inform the athlete, who decides whether to adopt it.',
    ],
    requirements: ['An actual 5000m distance peak, speed >0 and <=12 m/s'],
    sources: [],
    application: 'USER_CONFIRMATION',
  },
  {
    id: 'running-performance-vdot',
    version: '1',
    policyVersion: '3',
    metrics: ['VO2_MAX'],
    sports: ['RUN'],
    recipe: 'PERFORMANCE_VDOT',
    description:
      'Estimate VDOT from recorded running distance/time. In this product VDOT is stored as VO2_MAX; this is a method for the same metric, not a separate setting.',
    rationale:
      'The Daniels/Gilbert performance relationship divides the estimated oxygen cost of the recorded speed by the fraction associated with its duration. This produces an equivalent running-performance index (VDOT), rather than a laboratory measurement of oxygen uptake; the product stores it under VO2_MAX.',
    interpretation: [
      'Valid distance and time from an ordinary run or a suitable window within it are enough to compute a performance estimate. The function name and race-derived relationship do not require the activity to be a race or a confirmed maximal test.',
      'A non-maximal run expresses demonstrated performance and may yield a lower VDOT than the athlete could achieve racing. That affects interpretation rather than computability; the unused capacity cannot be recovered by inventing an effort adjustment. Terrain, timing and conditions also affect comparability.',
      'A new estimate above the existing VDOT may still be a useful reference even without maximal effort. Compare the values and identify their evidence and methods; a lower result from an easy run alone does not demonstrate a fitness decline. The athlete decides whether to adopt the new reference.',
    ],
    requirements: [
      'A 1500m–marathon distance peak with plausible recorded speed and duration',
    ],
    sources: ['https://support.vdoto2.com/v-o2-faq/'],
    application: 'USER_CONFIRMATION',
  },
  {
    id: 'running-effective-vo2max',
    version: '1',
    policyVersion: '3',
    metrics: ['VO2_MAX'],
    sports: ['RUN'],
    recipe: 'ACTIVITY_VO2',
    description:
      'Recompute VDOT (canonical metric VO2_MAX) from activity estimates with current source preference, correction factor and time decay; does not reprocess raw sensors.',
    rationale:
      'Activity estimates can infer effective aerobic performance from ordinary running, including pace relative to heart-rate effort where that source is selected. This recipe combines the existing per-activity estimates with time-decay weighting so newer evidence contributes more; it does not require the athlete to reach maximal oxygen uptake.',
    interpretation: [
      'Routine training is a normal source for this estimator. Existing valid per-activity estimates in the requested scope are its inputs; no race or maximal test is an additional requirement. A single valid activity can contribute a result, while more comparable observations can provide context for day-to-day variability.',
      "The result inherits each source's assumptions, including heart-rate reference, sensor quality, pace, conditions and correction settings where applicable. Time weighting summarizes observations; it does not make their physiological accuracy certain or revalidate the raw recordings.",
      "Compare with the existing VDOT reference and distinguish a result from the selected activity from an aggregate over a date range. A difference can reflect fitness, conditions or source/settings changes. Present that context without withholding the computable estimate; adoption is the athlete's choice.",
    ],
    requirements: [
      'READY activities with valid VO2 estimate provenance',
      '40-day decay, ignore data older than 120 days at the fixed assessment cutoff',
    ],
    sources: ['https://runalyze.com/help/article/vo2max'],
    application: 'USER_CONFIRMATION',
  },
  {
    id: 'observed-max-hr',
    version: '1',
    policyVersion: '2',
    metrics: ['MAX_HR'],
    sports: ['RUN', 'CYCLING', 'SWIM', 'UNKNOWN'],
    recipe: 'OBSERVED_HR',
    description:
      'Observe maximum recorded heart rate from activity peaks. Not a physiological MaxHR estimate but may be explicitly adopted by the user as a MaxHR reference setting.',
    rationale:
      "The highest credible recorded heart rate is direct evidence of a rate the athlete has reached. It can inform a MaxHR reference without a dedicated maximal test, while an observed peak alone does not establish the athlete's ultimate physiological maximum.",
    interpretation: [
      'Ordinary activity heart-rate peaks are sufficient for this observation. The calculator prefers one-second peaks and otherwise uses the highest available window mean; a window mean is not an instantaneous peak. No maximal-effort claim is needed to report the result.',
      'If a credible observed value exceeds the current reference, it provides evidence that the reference may be too low even when the activity was not all-out. A lower peak in an easy activity does not show that physiological MaxHR fell. Sensor spikes remain possible, and a higher bpm is not itself a fitness improvement.',
      'Show the observation and its difference from the current same-scope reference, explaining the measurement window and any relevant data limitation. The athlete may choose to adopt it as a reference without claiming it is a measured physiological maximum.',
    ],
    requirements: [
      'Prefer 1-second measured HR peaks; otherwise report peak of available window means',
      '80–240 bpm, recorded observation; explicit adoption is not proof of physiological maximum; never infer from age or fabricate a baseline',
    ],
    sources: [],
    application: 'USER_CONFIRMATION',
  },
  {
    id: 'daily-resting-hr',
    version: '1',
    policyVersion: '2',
    metrics: ['RESTING_HR'],
    sports: ['UNKNOWN'],
    recipe: 'DAILY_RESTING_HR',
    description:
      'Median of provider-selected daily resting HR facts for the requested local-date range. Global metric, not exercise minimum HR.',
    rationale:
      'Daily resting-heart-rate observations describe heart rate at rest. Their median gives a typical value for the selected dates and reduces the influence of isolated high or low readings. This uses routine health data, with no exercise test involved.',
    interpretation: [
      'Available daily resting-HR records are enough to compute this summary, even if there is only one day. More days and consistent measurement conditions improve representativeness; they are not additional minimum-count requirements.',
      'The lowest heart rate during an activity is not necessarily resting heart rate. An activity-only request lacks the daily resting facts used by this recipe; that is a source mismatch, not a reason to request a harder workout.',
      'Compare with the existing resting-HR reference over a stated date range. Sleep, illness, stress, medication and measurement conditions can influence the difference; lower is not automatically better, and one summary does not establish a health diagnosis. The athlete decides whether it is a useful new reference.',
    ],
    requirements: [
      'DATE or RECENT range (not ACTIVITY); historical intraday asOf is unsupported for daily facts',
      'Canonical daily resting-HR records with bpm units and matching user timezone',
    ],
    sources: [],
    application: 'USER_CONFIRMATION',
  },
  {
    id: 'aerobic-threshold-unavailable',
    version: '1',
    policyVersion: '2',
    metrics: ['AET_HR', 'AET_PACE'],
    sports: ['RUN', 'CYCLING', 'SWIM', 'UNKNOWN'],
    recipe: 'UNAVAILABLE',
    description:
      'No deterministic aerobic-threshold estimator is registered for AET_HR or AET_PACE.',
    rationale:
      'Aerobic threshold refers to the lower aerobic-intensity transition and differs from the higher threshold represented by LTHR/TP. It is a physiological concept rather than a fixed percentage of another setting. This catalog entry records a software capability gap, not a requirement for maximal exercise.',
    interpretation: [
      'Ordinary training, perceived effort and relevant heart-rate/pace behavior can inform an explained aerobic-intensity estimate when an applicable relationship and sufficient context are available. Absence of a registered calculator does not make those observations worthless or imply that the athlete must perform an extreme test.',
      'A fixed heart-rate percentage or ordinary drift alone does not identify a measured aerobic threshold. Coaching estimates can state their actual evidence, assumptions and uncertainty; a training-intensity guide remains distinct from a measured threshold and from a completed tool calculation.',
      'When an evidence-based numerical estimate is supported, its comparison with an existing reference can help the athlete decide how to use it. When evidence is insufficient, explain the specific missing observation instead of treating a maximal test as the default next step.',
    ],
    unavailableReason: 'NO_VALIDATED_AEROBIC_METHOD',
    requirements: [
      'A separately validated protocol and algorithm are required; additional ordinary workouts do not fix missing software support',
    ],
    sources: [],
    application: 'UNAVAILABLE',
  },
];
export function normalizeFitnessMetric(metric?: string) {
  const normalized = metric?.toUpperCase().replace(/[\s-]/g, '_');
  return (
    (
      {
        VDOT: 'VO2_MAX',
        VO2MAX: 'VO2_MAX',
        'VO₂MAX': 'VO2_MAX',
        PMAX: 'P_MAX',
        WPRIME: 'W_PRIME',
        'W′': 'W_PRIME',
        "W'": 'W_PRIME',
        CSS: 'CS',
        RHR: 'RESTING_HR',
        MAXHR: 'MAX_HR',
      } as Record<string, string>
    )[normalized ?? ''] ?? normalized
  );
}
export function fitnessMethods(metric?: string, sport?: string) {
  return METHODS.filter(
    (m) =>
      (!metric ||
        m.metrics.includes(normalizeFitnessMetric(metric) as FitnessMetric)) &&
      (!sport || m.sports.includes(sport.toUpperCase() as FitnessSport)),
  ).map((m) => ({
    ...m,
    availability: m.recipe === 'UNAVAILABLE' ? 'UNSUPPORTED' : 'AVAILABLE',
    disabled: methodDisabled(m.id),
    testTrackingAvailable: m.recipe === 'HR_TEST_SEGMENT',
    applicationAvailable: fitnessApplicationEnabled(m.id),
  }));
}
export function methodDisabled(id: string) {
  const disabled = (process.env.FITNESS_DISABLED_METHODS ?? '')
    .split(',')
    .map((s) => s.trim());
  return (
    disabled.includes(id) ||
    disabled.includes(`${id}@${fitnessMethod(id)?.version}`)
  );
}
export function fitnessMethod(id: string): FitnessMethod | undefined {
  return METHODS.find((m) => m.id === id);
}

/** User adoption is a setting decision, not scientific method certification. */
export function fitnessApplicationEnabled(id: string) {
  const method = fitnessMethod(id);
  return (
    method?.application === 'USER_CONFIRMATION' &&
    !methodDisabled(id) &&
    process.env.FITNESS_ASSESSMENT_ENABLED === 'true' &&
    process.env.FITNESS_ESTIMATE_APPLY_ENABLED !== 'false' &&
    (!method.metrics.includes('LTHR') ||
      process.env.FITNESS_LTHR_APPLY_ENABLED !== 'false')
  );
}
