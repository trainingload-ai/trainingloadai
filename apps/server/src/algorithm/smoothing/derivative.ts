/**
 * 计算 f(x) = y 的数组导数
 *
 * 给定离散点 x_i 的 f(x) 导数计算公式为：
 *      d/dx f(x_i) = (f(x_i) - f(x_i-1)) / (x_i - x_i-1)
 * 对于 i > 0
 * 且
 *      d/dx f(x_0) = d/dx f(x_1)
 *
 * 移植自 Runalyze PHP 实现
 */
export class Derivative {
  /**
   * 计算导数
   * @param y y 值数组（例如海拔）
   * @param x x 值数组（例如距离）
   * @returns 导数数组
   */
  public calculate(y: number[], x: number[]): number[] {
    const num = y.length;
    if (x.length !== num) {
      throw new Error('输入数组大小必须相同。');
    }

    if (num === 0) {
      throw new Error('输入数组不能为空。');
    }

    const ddx: number[] = [];

    for (let i = 1; i < num; ++i) {
      const deltaX = x[i] - x[i - 1];
      const deltaY = y[i] - y[i - 1];

      if (deltaX > 0) {
        ddx.push(deltaY / deltaX);
      } else if (i > 1) {
        // 如果 deltaX 为 0（重复的 x 值），使用前一个导数
        // 注意：i 从 1 开始。ddx 大小为 i-1。
        // ddx[i-2] 是刚刚推入的元素？
        // 当 i=2 时，ddx 有 1 个元素（索引 0）。ddx[2-2] = ddx[0]。正确。
        ddx.push(ddx[ddx.length - 1]);
      } else {
        ddx.push(0);
      }
    }

    // 预置第一个值 (d/dx f(x_0) = d/dx f(x_1))
    if (ddx.length > 0) {
      ddx.unshift(ddx[0]);
    } else {
      // 如果数组只有一个元素，循环未运行。
      ddx.push(0);
    }

    return ddx;
  }
}
