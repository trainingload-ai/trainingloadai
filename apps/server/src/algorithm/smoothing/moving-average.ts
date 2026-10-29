import { AbstractKernel } from './kernel';

/**
 * 抽象移动平均类
 */
export abstract class AbstractMovingAverage {
  protected data: number[] = [];
  protected length: number = 0;
  protected movingAverage: number[] = [];
  protected indexData: number[] = [];

  constructor(data: number[], indexData: number[] = []) {
    this.data = data;
    this.length = data.length;
    this.indexData = indexData;
  }

  public getMovingAverage(): number[] {
    return this.movingAverage;
  }

  public abstract calculate(): void;
}

/**
 * 带核平滑的移动平均
 * 移植自 Runalyze PHP 实现
 */
export class WithKernel extends AbstractMovingAverage {
  protected kernel: AbstractKernel | null = null;

  constructor(data: number[], indexData: number[] = []) {
    super(data, indexData);
  }

  /**
   * 设置平滑核
   */
  public setKernel(kernel: AbstractKernel): void {
    this.kernel = kernel;
  }

  /**
   * 检查核是否已设置
   */
  protected checkThatKernelExists(): void {
    if (this.kernel === null) {
      throw new Error('Kernel must be set.');
    }
  }

  /**
   * 计算移动平均
   * 根据提供的索引数据自动选择基于索引或均匀采样
   */
  public calculate(): void {
    this.checkThatKernelExists();
    this.movingAverage = [];

    if (this.indexData && this.indexData.length > 0) {
      this.calculateWithIndexData();
    } else {
      this.calculateWithoutIndexData();
    }
  }

  /**
   * 使用索引数据计算（非均匀采样）
   * Y_hat (X_0) = sum(K(X_0, X_i) * DeltaX_i * Y(X_i)) / sum(K(X_0, X_i) * DeltaX_i)
   */
  protected calculateWithIndexData(): void {
    if (!this.kernel) return;

    // 使用核宽度的一半作为最大差异（半径）
    const maxDiff = this.kernel.width() / 2;

    // 将索引 -1 处理为 0（时间/距离的开始）
    const getIndexData = (idx: number) => {
      if (idx < 0) return 0;
      if (idx >= this.indexData.length)
        return this.indexData[this.indexData.length - 1];
      return this.indexData[idx];
    };

    for (let i = 0; i < this.length; ++i) {
      let upper = 0;
      let lower = 0;

      // 获取 maxDiff 半径内的有效邻居
      const neighbors = this.deltasToRespect(i, maxDiff);

      for (const neighbor of neighbors) {
        const deltaIndex = neighbor.indexOffset; // 例如 -1, 0, 1
        const deltaValue = neighbor.valueDiff; // 例如 -5.0, 0.0, 5.0

        const kernelFactor = this.kernel.at(deltaValue);

        // 计算加权因子（时间/距离步长）
        // 模仿 PHP 逻辑: $indexDelta = $this->IndexData[$i + $deltaIndex] - $this->IndexData[$i + $deltaIndex - 1];
        const currentIdx = i + deltaIndex;
        const indexDelta =
          getIndexData(currentIdx) - getIndexData(currentIdx - 1);

        upper += kernelFactor * indexDelta * this.data[currentIdx];
        lower += kernelFactor * indexDelta;
      }

      if (lower === 0) {
        this.movingAverage.push(this.data[i]);
      } else {
        this.movingAverage.push(upper / lower);
      }
    }
  }

  /**
   * 查找 maxDiff 范围内的有效邻居
   * @param currentIndex 当前索引 i
   * @param maxDiff 索引数据值的最大允许差异
   * @returns { indexOffset, valueDiff } 数组
   */
  protected deltasToRespect(
    currentIndex: number,
    maxDiff: number,
  ): { indexOffset: number; valueDiff: number }[] {
    const x = this.indexData[currentIndex];
    const results: { indexOffset: number; valueDiff: number }[] = [];

    // 当前点（始终包含）
    results.push({ indexOffset: 0, valueDiff: 0 });

    // 向后查找
    let delta = -1;
    while (
      currentIndex + delta >= 0 &&
      x - this.indexData[currentIndex + delta] <= maxDiff
    ) {
      // 这里的逻辑完全复刻 Runalyze PHP 实现
      // 它似乎使用了偏移后的索引差值作为权重计算的一部分
      const val = this.indexData[currentIndex + delta + 1] - x;
      results.push({ indexOffset: delta, valueDiff: val });
      delta--;
    }

    // 向前查找
    delta = 1;
    while (
      currentIndex + delta < this.length &&
      this.indexData[currentIndex + delta] - x <= maxDiff
    ) {
      const val = this.indexData[currentIndex + delta - 1] - x;
      results.push({ indexOffset: delta, valueDiff: val });
      delta++;
    }
    return results;
  }

  /**
   * 不使用索引数据计算（均匀采样）
   */
  protected calculateWithoutIndexData(): void {
    if (!this.kernel) return;

    // 核宽度是基于数组索引的
    const halfWidth = Math.floor(this.kernel.width() / 2);

    for (let i = 0; i < this.length; ++i) {
      let upper = 0;
      let lower = 0;

      for (let j = -halfWidth; j <= halfWidth; ++j) {
        const index = i + j;

        if (index >= 0 && index < this.length) {
          const kernelValue = this.kernel.at(j);
          upper += kernelValue * this.data[index];
          lower += kernelValue;
        } else {
          // 处理边界：将超出范围的索引映射到最近的有效索引（0 或 length-1）
          // 这种策略称为“钳位”（clamping）
          const clampedIndex = Math.max(0, Math.min(index, this.length - 1));
          const kernelValue = this.kernel.at(j);
          upper += kernelValue * this.data[clampedIndex];
          lower += kernelValue;
        }
      }

      if (lower === 0) {
        this.movingAverage.push(this.data[i]);
      } else {
        this.movingAverage.push(upper / lower);
      }
    }
  }
}
