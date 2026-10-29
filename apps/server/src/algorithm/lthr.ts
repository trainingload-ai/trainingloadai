/**
 * 动态系统建模估算乳酸阈值心率 (LTHR)
 * 核心算法：带遗忘因子的递推最小二乘法 (RLS) + 参数变化率检测
 *
 * 原理：
 * 心率与功率（或配速）在有氧区间通常呈线性关系。当接近乳酸阈值（LT）时，
 * 这种线性关系会发生改变（例如心率漂移加速，或单位功率的心率成本增加）。
 * 该算法使用 ARX (AutoRegressive with eXogenous input) 模型实时拟合心率响应：
 * HR(t) = a1*HR(t-1) + a2*HR(t-2) + b0*Power(t-1) + e(t)
 *
 * 通过 RLS 实时更新参数 [a1, a2, b0]，当检测到参数（特别是增益 b0 或系统惯性 a1,a2）
 * 发生显著变化时，识别为潜在的阈值点。
 */
export class LTHRDynamicEstimator {
  private options: {
    lambda: number; // 遗忘因子 (0.95-1), 越小对新数据敏感
    initialP: number; // 初始协方差矩阵对角值
    thetaSize: number; // 模型阶数: [a1, a2, b0] (ARX模型)
    windowSize: number; // 检测阈值变化的窗口
    changeThreshold: number; // 参数变化率阈值
  };

  private theta: number[]; // 参数向量 [a1, a2, b0]
  private P: number[][]; // 协方差矩阵
  private history: {
    power: number[]; // 输入: 功率/配速
    hr: number[]; // 输出: 心率
    timestamp: number[]; // 时间戳 (ms)
  };

  private thetaHistory: number[][]; // 参数历史
  private detectedThreshold: number | null; // 检测到的阈值心率
  private thresholdConfidence: number; // 置信度

  constructor(
    options: Partial<{
      lambda: number;
      initialP: number;
      thetaSize: number;
      windowSize: number;
      changeThreshold: number;
    }> = {},
  ) {
    this.options = {
      lambda: 0.98,
      initialP: 1000,
      thetaSize: 3,
      windowSize: 30,
      changeThreshold: 0.15,
      ...options,
    };

    // 初始化参数向量 theta = [a1, a2, b0]
    // 初始猜测：系统有一定的惯性 (a1=0.9)，对输入有正向响应 (b0=0.1)
    this.theta = [0.9, 0.05, 0.1];

    // 初始化协方差矩阵 P (越大表示初始不确定性高)
    this.P = Array(this.options.thetaSize)
      .fill(0)
      .map(() => Array(this.options.thetaSize).fill(0));
    for (let i = 0; i < this.options.thetaSize; i++) {
      this.P[i][i] = this.options.initialP;
    }

    // 数据缓存
    this.history = {
      power: [],
      hr: [],
      timestamp: [],
    };

    // 参数历史 (用于检测变化率)
    this.thetaHistory = [];
    this.detectedThreshold = null;
    this.thresholdConfidence = 0;
  }

  /**
   * 添加新数据点 (实时流式处理)
   * @param power 功率或配速
   * @param hr 心率
   * @param timestamp 时间戳
   */
  addDataPoint(power: number, hr: number, timestamp: number = Date.now()) {
    // 存储数据
    this.history.power.push(power);
    this.history.hr.push(hr);
    this.history.timestamp.push(timestamp);

    // 需要至少3个历史点才能构建特征向量 (因为用了 HR(t-1), HR(t-2))
    const len = this.history.hr.length;
    if (len < 3) return null;

    // --- 构建特征向量 φ(t) = [hr(t-1), hr(t-2), power(t-1)] ---
    const hr1 = this.history.hr[len - 2]; // hr(t-1)
    const hr2 = this.history.hr[len - 3]; // hr(t-2)
    const p1 = this.history.power[len - 2]; // power(t-1)
    const phi = [hr1, hr2, p1];

    // 当前测量值 y(t) = hr(t)
    const y = hr;

    // --- 递推最小二乘法 (RLS) 更新参数 ---
    this._updateRLS(phi, y);

    // 保存参数历史
    this.thetaHistory.push([...this.theta]);

    // 检测参数是否发生显著变化 (潜在阈值点)
    const changePoint = this._detectChange();

    if (changePoint) {
      // 估算LTHR: 取变化点前30秒(或windowSize)的平均心率
      // 这里简单取最近 windowSize 长度的均值
      const idx = this.history.hr.length - 1;
      const startIdx = Math.max(0, idx - this.options.windowSize);
      const recentHr = this.history.hr.slice(startIdx, idx + 1);
      if (recentHr.length > 0) {
        const avgHr = recentHr.reduce((a, b) => a + b, 0) / recentHr.length;
        this.detectedThreshold = avgHr;
        // 每次检测到变化，稍微增加一点置信度，但设置上限
        this.thresholdConfidence = Math.min(
          0.8,
          this.thresholdConfidence + 0.1,
        );
      }
    }

    return {
      theta: this.theta,
      detectedThreshold: this.detectedThreshold,
      confidence: this.thresholdConfidence,
    };
  }

  /**
   * RLS核心算法 (带遗忘因子)
   */
  private _updateRLS(phi: number[], y: number) {
    const { lambda, thetaSize } = this.options;

    // 1. 计算增益向量 K = P * φ / (λ + φ^T * P * φ)
    // Pphi = P * φ (Matrix * Vector)
    const Pphi = this.P.map((row) =>
      row.reduce((sum, val, j) => sum + val * phi[j], 0),
    );

    // phiPphi = φ^T * P * φ (Scalar)
    const phiPphi = phi.reduce((sum, val, i) => sum + val * Pphi[i], 0);
    const denominator = lambda + phiPphi;
    const K = Pphi.map((val) => val / denominator);

    // 2. 计算预测误差 e = y - φ^T * θ
    const yHat = phi.reduce((sum, val, i) => sum + val * this.theta[i], 0);
    const e = y - yHat;

    // 3. 更新参数 θ = θ + K * e
    for (let i = 0; i < thetaSize; i++) {
      this.theta[i] += K[i] * e;
    }

    // 4. 更新协方差矩阵 P = (P - K * φ^T * P) / λ
    // newP = (P - K * (φ^T * P)) / λ
    // 注意: φ^T * P 其实就是 Pphi 的转置（因为P是对称阵）
    const newP = Array(thetaSize)
      .fill(0)
      .map(() => Array(thetaSize).fill(0));

    for (let i = 0; i < thetaSize; i++) {
      for (let j = 0; j < thetaSize; j++) {
        // term = K[i] * (φ^T * P)[j] = K[i] * Pphi[j]
        const term = K[i] * Pphi[j];
        newP[i][j] = (this.P[i][j] - term) / lambda;
      }
    }
    this.P = newP;
  }

  /**
   * 检测参数变化率 (滑动窗口)
   */
  private _detectChange() {
    const { windowSize, changeThreshold } = this.options;
    if (this.thetaHistory.length < windowSize * 2) return false;

    // 计算参数变化率: 比较最近窗口和之前窗口的均值
    const recent = this.thetaHistory.slice(-windowSize);
    const previous = this.thetaHistory.slice(-windowSize * 2, -windowSize);

    // 关注 b0 参数 (功率/配速的增益，即 theta[2])
    const recentB0 =
      recent.map((t) => t[2]).reduce((a, b) => a + b, 0) / windowSize;
    const prevB0 =
      previous.map((t) => t[2]).reduce((a, b) => a + b, 0) / windowSize;

    // 相对变化率
    // 防止除以0
    const denomB0 = Math.abs(prevB0) < 1e-6 ? 1e-6 : prevB0;
    const changeRate = Math.abs((recentB0 - prevB0) / denomB0);

    // 检查 a1, a2 (心率惯性参数)
    // 这里简单取 (a1+a2)/2 的变化
    const recentA =
      recent.map((t) => (t[0] + t[1]) / 2).reduce((a, b) => a + b, 0) /
      windowSize;
    const prevA =
      previous.map((t) => (t[0] + t[1]) / 2).reduce((a, b) => a + b, 0) /
      windowSize;
    const denomA = Math.abs(prevA) < 1e-6 ? 1e-6 : prevA;
    const aChange = Math.abs((recentA - prevA) / denomA);

    // 参数显著变化 → 可能是阈值点
    // 经验法则：增益变化或系统惯性变化超过阈值
    return changeRate > changeThreshold || aChange > changeThreshold * 1.5;
  }

  /**
   * 批量处理完整测试数据 (后处理)
   */
  batchProcess(dataPoints: { power: number; hr: number; timestamp: number }[]) {
    // 重置状态
    this.history = { power: [], hr: [], timestamp: [] };
    this.thetaHistory = [];
    this.theta = [0.9, 0.05, 0.1]; // Reset theta
    // Reset P
    this.P = Array(this.options.thetaSize)
      .fill(0)
      .map(() => Array(this.options.thetaSize).fill(0));
    for (let i = 0; i < this.options.thetaSize; i++) {
      this.P[i][i] = this.options.initialP;
    }

    // 逐点处理
    dataPoints.forEach((d) => this.addDataPoint(d.power, d.hr, d.timestamp));

    // 后处理: 寻找参数变化最剧烈的点
    if (this.thetaHistory.length < this.options.windowSize * 2) return null;

    const changes: { index: number; value: number }[] = [];
    // 从 windowSize 开始，因为需要历史窗口
    for (let i = this.options.windowSize; i < this.thetaHistory.length; i++) {
      const prev = this.thetaHistory[i - this.options.windowSize];
      const curr = this.thetaHistory[i];

      // 计算增益 b0 (theta[2]) 的变化率
      // 使用瞬时变化可能噪声大，但这里是寻找最大突变点
      const denom = Math.abs(prev[2]) < 1e-6 ? 1e-6 : prev[2];
      const b0Change = Math.abs((curr[2] - prev[2]) / denom);
      changes.push({ index: i, value: b0Change });
    }

    // 找到变化率最大的点
    const maxChange = changes.reduce(
      (max, c) => (c.value > max.value ? c : max),
      { value: 0, index: 0 },
    );

    if (maxChange.value > this.options.changeThreshold) {
      // 对应的 HR 是在 history.hr 中 maxChange.index 处
      // 注意：thetaHistory 的索引 i 对应于 addDataPoint 的第 i 次调用
      // addDataPoint 在 len < 3 时返回 null 且不 push thetaHistory
      // 但我们在 batchProcess 里是从头 push 的。
      // 实际上 addDataPoint 逻辑里：
      // 1. push data
      // 2. if len < 3 return
      // 3. update RLS
      // 4. push thetaHistory
      // 所以 thetaHistory[0] 对应 history.hr[2] (第3个点)
      // thetaHistory[k] 对应 history.hr[k+2]

      const dataIndex = maxChange.index + 2;
      if (dataIndex < this.history.hr.length) {
        // 取该点附近的平滑值作为 LTHR
        const smoothWindow = 5;
        const start = Math.max(0, dataIndex - smoothWindow);
        const end = Math.min(this.history.hr.length, dataIndex + smoothWindow);
        const slice = this.history.hr.slice(start, end);
        this.detectedThreshold =
          slice.reduce((a, b) => a + b, 0) / slice.length;
        this.thresholdConfidence = 0.8; // 后处理通常比实时检测更准
      }
    }

    return {
      thresholdHr: this.detectedThreshold,
      confidence: this.thresholdConfidence,
      parameterHistory: this.thetaHistory,
    };
  }
}
