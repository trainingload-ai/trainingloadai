import { AbstractKernel } from './kernel';
import { WithKernel } from './moving-average';
import { Derivative } from './derivative';

/**
 * 坡度计算（可选平滑）
 * 移植自 Runalyze PHP 实现
 */
export class Gradient {
  protected elevation: number[] = [];
  protected distance: number[] = [];
  protected gradient: number[] = [];
  protected movingAverageKernel: AbstractKernel | null = null;

  constructor(elevation: number[] = [], distance: number[] = []) {
    if (elevation.length > 0 && distance.length > 0) {
      this.setData(elevation, distance);
    }
  }

  /**
   * 设置数据
   */
  public setData(elevation: number[], distance: number[]): void {
    if (elevation.length !== distance.length) {
      throw new Error('输入数组大小必须相同。');
    }
    this.elevation = [...elevation]; // 复制以避免修改原始数组（如果非预期）
    this.distance = distance;
  }

  /**
   * 设置移动平均核
   * 核将仅应用于海拔数据，而不使用距离作为索引
   * (注意：Runalyze 实现使用 `new WithKernel($elevation)`，如果未提供索引数据，默认为均匀采样。
   * Runalyze 代码没有将 `$this->Distance` 传递给构造函数。)
   */
  public setMovingAverageKernel(kernel: AbstractKernel): void {
    this.movingAverageKernel = kernel;
  }

  /**
   * 计算坡度并可选地平滑海拔
   */
  public calculate(): void {
    if (this.elevation.length === 0) {
      return;
    }

    // 如果设置了核，应用平滑到海拔
    this.applyMovingAverage();

    // 计算导数
    const derivative = new Derivative();
    const rawGradient = derivative.calculate(this.elevation, this.distance);

    // 映射到百分比 (或 Runalyze 单位)
    // Runalyze: return $value / 10;
    // 如果 Runalyze 输入距离是 km，则 rawGradient 是 m/km。
    // m/km / 10 = %。
    // 我们假设输入距离是米（Starshards 标准）。
    // rawGradient 是 m/m (比率)。
    // % = 比率 * 100。

    this.gradient = rawGradient.map((val) => val * 100);
  }

  /**
   * 对海拔应用移动平均
   */
  protected applyMovingAverage(): void {
    if (this.movingAverageKernel !== null) {
      // Runalyze 使用均匀采样（未传递索引数据）
      const movingAverage = new WithKernel(this.elevation);
      movingAverage.setKernel(this.movingAverageKernel);
      movingAverage.calculate();

      this.elevation = movingAverage.getMovingAverage();
    }
  }

  /**
   * 获取平滑后的海拔序列
   */
  public getSmoothedElevation(): number[] {
    return this.elevation;
  }

  /**
   * 获取坡度序列
   */
  public getGradient(): number[] {
    return this.gradient;
  }
}
