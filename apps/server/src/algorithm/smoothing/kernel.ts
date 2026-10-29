export abstract class AbstractKernel {
  protected _width: number;

  constructor(width: number) {
    this._width = width;
  }

  /**
   * 获取核宽度
   */
  public width(): number {
    return this._width;
  }

  /**
   * 计算特定 delta 处的核值
   * @param delta 距离中心的距离
   */
  public abstract at(delta: number): number;

  /**
   * 计算多个索引处的核值
   * @param indices 距离中心的距离数组
   */
  public valuesAt(indices: number[]): number[] {
    return indices.map((index) => this.at(index));
  }
}

/**
 * 高斯核
 * 标准实现：e^(-0.5 * (x/sigma)^2)
 */
export class GaussianKernel extends AbstractKernel {
  private sigma: number;

  /**
   * @param width 核的全宽（为了对称性应为奇数）
   *              如果未提供宽度，默认为 2*ceil(3*sigma)+1
   * @param sigma 标准差。如果未提供，则从宽度推导。
   */
  constructor(width?: number, sigma?: number) {
    if (sigma === undefined && width !== undefined) {
      // 如果未提供 sigma，从宽度近似
      // 通常宽度 ~ 6*sigma
      sigma = width / 6;
    } else if (sigma !== undefined && width === undefined) {
      // 从 sigma 计算宽度（覆盖 +/- 3 sigma）
      width = 2 * Math.ceil(3 * sigma) + 1;
    } else if (sigma === undefined && width === undefined) {
      // 默认回退值
      sigma = 1;
      width = 7;
    }

    super(width!);
    this.sigma = sigma!;
  }

  public at(delta: number): number {
    // 标准高斯函数（未归一化，因为归一化发生在平滑步骤中）
    // f(x) = exp(-0.5 * (x / sigma)^2)
    return Math.exp(-0.5 * Math.pow(delta / this.sigma, 2));
  }
}

/**
 * 矩形核（线性核） - 实际上是简单移动平均
 */
export class BoxcarKernel extends AbstractKernel {
  constructor(width: number) {
    super(width);
  }

  public at(delta: number): number {
    // 通常窗口内为 1，窗口外为 0。
    // 平滑算法处理窗口逻辑，所以如果我们在窗口内只返回 1。
    // 对于矩形核，权重是均匀的（1）。
    if (Math.abs(delta) <= this._width / 2) {
      return 1;
    }
    return 0;
  }
}
