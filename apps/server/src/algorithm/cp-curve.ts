import { ExtendedCPModel } from './cp-estimate';

/**
 * Extended CP 曲线数据点
 */
export interface ExtendedCPCurvePoint {
  time: number; // 时间 (分钟)
  power: number; // 功率 (瓦特)
}

/**
 * 生成 Extended CP 曲线数据点
 *
 * 移植自 GoldenCheetah ExtendedCriticalPower.cpp getPlotCurveForExtendedCP_2_3
 *
 * @param model 计算好的 Extended CP 模型参数
 * @param pointsCount 生成的点数，默认 1000
 * @param tMinMin 最小时间 (分钟)，默认 1/60 (1秒)
 * @param tMaxMin 最大时间 (分钟)，默认 600 (10小时)
 */
export function generateExtendedCPCurve(
  model: ExtendedCPModel,
  pointsCount: number = 1000,
  tMinMin: number = 1.0 / 60.0,
  tMaxMin: number = 600.0,
): ExtendedCPCurvePoint[] {
  const curvePoints: ExtendedCPCurvePoint[] = [];

  // 使用对数分布生成时间点，以更好地覆盖短时间的高频变化
  // t = tmax^x * tmin^(1-x)  其中 x 从 0 到 1

  for (let i = 0; i < pointsCount; i++) {
    const x = i / (pointsCount - 1);
    const t = Math.pow(tMaxMin, x) * Math.pow(tMinMin, 1 - x);

    const power =
      model.paa * Math.exp(model.paa_dec * t) +
      model.ecp *
        (1 - Math.exp(model.ecp_del * t)) *
        (1 + model.ecp_dec * Math.exp(model.ecp_dec_del / t)) *
        (1 + model.etau / t);

    curvePoints.push({
      time: t,
      power: power,
    });
  }

  return curvePoints;
}
