/**
 * 扩展临界功率 (Extended Critical Power) 模型参数
 *
 * 基于 GoldenCheetah 的 ExtendedCriticalPower (eCP) v2.3 模型
 */
export interface ExtendedCPModel {
  /** 模型版本 */
  version: string;

  /** 无氧做功容量相关参数 (Anaerobic Work Capacity parameter) */
  paa: number;

  /** 无氧衰减系数 (Anaerobic Decay) */
  paa_dec: number;

  /** 扩展临界功率 (Extended Critical Power) */
  ecp: number;

  /** 临界功率衰减系数 (CP Decay) */
  ecp_dec: number;

  /** 临界功率延迟系数 (CP Delay) */
  ecp_del: number;

  /** 临界功率衰减延迟 (CP Decay Delay) */
  ecp_dec_del: number;

  /** 时间常数 (Tau) */
  etau: number;

  /** 理论最大瞬时功率 (Pmax) */
  pMax: number;

  /** 无氧做功容量 (Anaerobic Work Capacity) - 单位: 焦耳 (J) */
  wPrime: number;

  /** 60分钟理论最大平均功率 (MMP60) */
  mmp60: number;
}

/**
 * 估算 Extended CP 模型参数
 *
 * 移植自 GoldenCheetah ExtendedCriticalPower.cpp deriveExtendedCP_2_3_Parameters
 *
 * @param mmpData 平均最大功率数组 (Mean Maximal Power)，内核直接读取秒索引（mmpData[30] 为 30 秒）。旧调用方适配行为保持不变；新评估路径在 index 0 放置哨兵。
 * @param options 可选的时间区间边界 (单位：分钟)
 */
export function estimateExtendedCP(
  mmpData: number[],
  options?: {
    onDiagnostics?: (diagnostics: {
      converged: boolean;
      iterations: number;
    }) => void;
    sanI1?: number; // 短无氧区间下限 (Short Anaerobic), 默认 0.5 (30s)
    sanI2?: number; // 短无氧区间上限, 默认 1.0 (60s)
    anI1?: number; // 无氧区间下限 (Anaerobic), 默认 1.0 (60s)
    anI2?: number; // 无氧区间上限, 默认 3.0 (180s)
    aeI1?: number; // 有氧区间下限 (Aerobic), 默认 10.0 (600s)
    aeI2?: number; // 有氧区间上限, 默认 20.0 (1200s)
    laeI1?: number; // 长有氧区间下限 (Long Aerobic), 默认 60.0 (3600s)
    laeI2?: number; // 长有氧区间上限, 默认 120.0 (7200s)
  },
): ExtendedCPModel {
  const model: ExtendedCPModel = {
    version: 'eCP v2.3',
    paa: 0,
    paa_dec: -2,
    etau: 1,
    ecp: 0,
    ecp_del: -1,
    ecp_dec: -0.2,
    ecp_dec_del: -180,
    pMax: 0,
    wPrime: 0,
    mmp60: 0,
  };

  // 设置时间区间边界 (分钟)
  const t1 = options?.sanI1 ?? 0.5;
  const t2 = options?.sanI2 ?? 1.0;
  const t3 = options?.anI1 ?? 1.0;
  const t4 = options?.anI2 ?? 3.0;
  const t5 = options?.aeI1 ?? 10.0;
  const t6 = options?.aeI2 ?? 20.0;
  const t7 = options?.laeI1 ?? 60.0;
  const t8 = options?.laeI2 ?? 120.0;

  // 转换为数组索引 (假设 mmpData[i] 对应 i 秒，或者 i+1 秒？C++ 中是 i/60.0 分钟)
  // 为了安全起见，假设 mmpData 包含足够的数据，且 mmpData[t] 代表 t 秒的功率
  // 如果 mmpData 长度不足，需提前返回
  const maxSecs = mmpData.length - 1;

  // 辅助函数：安全获取索引，不超过数组长度
  const getIdx = (minMin: number, maxMin: number): [number, number] | null => {
    const start = Math.floor(minMin * 60);
    const end = Math.floor(maxMin * 60);
    if (start > maxSecs) return null;
    return [start, Math.min(end, maxSecs)];
  };

  const sanRange = getIdx(t1, t2);
  const anRange = getIdx(t3, t4);
  const aeRange = getIdx(t5, t6);
  const laeRange = getIdx(t7, t8);

  // laeRange (60-120min) is optional if data is not long enough
  if (!sanRange || !anRange || !aeRange) {
    // 数据不足，无法计算
    return model;
  }

  const [i1, i2] = sanRange;
  const [i3, i4] = anRange;
  const [i5, i6] = aeRange;

  // 常量定义
  const paa_min = 100;
  const etau_min = 0.5;
  const paa_dec_max = -0.25;
  const paa_dec_min = -3;
  const ecp_dec_min = -1.5;

  // 收敛阈值
  const etau_delta_max = 1e-4;
  const paa_delta_max = 1e-2;
  const paa_dec_delta_max = 1e-4;
  const ecp_del_delta_max = 1e-4;
  const ecp_dec_delta_max = 1e-8;

  const max_loops = 100;
  let iteration = 0;
  const withoutEcpDec = false;

  let etau_prev = 0;
  let paa_prev = 0;
  let paa_dec_prev = 0;
  let ecp_del_prev = 0;
  let ecp_dec_prev = 0;

  // 迭代求解
  do {
    if (iteration++ > max_loops) {
      console.warn('ecp2 模型迭代次数超过上限');
      break;
    }

    etau_prev = model.etau;
    paa_prev = model.paa;
    paa_dec_prev = model.paa_dec;
    ecp_del_prev = model.ecp_del;
    ecp_dec_prev = model.ecp_dec;

    if (withoutEcpDec) {
      model.ecp_dec = 0;
    }

    // 1. 估计 ecp (Extended Critical Power)
    model.ecp = 0;
    for (let i = i5; i <= i6; i++) {
      if (i === 0) continue;
      const t = i / 60.0;
      // 公式逆推 ecp
      // P = term1 + ecp * term2 * term3 * term4
      // ecp = (P - term1) / (term2 * term3 * term4)

      const term1 = model.paa * Math.exp(model.paa_dec * t);
      const term2 = 1 - Math.exp(model.ecp_del * t);
      const term3 = 1 + model.ecp_dec * Math.exp(model.ecp_dec_del / t);
      const term4 = 1 + model.etau / t;

      const ecpn = (mmpData[i] - term1) / term2 / term3 / term4;

      if (model.ecp < ecpn) {
        model.ecp = ecpn;
      }
    }

    if (model.ecp === 0.0) return model;

    // 2. 估计 etau (Time Constant)
    model.etau = etau_min;
    for (let i = i3; i <= i4; i++) {
      if (i === 0) continue;
      const t = i / 60.0;
      // P = term1 + ecp * term2 * term3 * (1 + etau/t)
      // P - term1 = ecp * term2 * term3 * (1 + etau/t)
      // (P - term1) / (ecp * term2 * term3) = 1 + etau/t
      // etau/t = (...) - 1
      // etau = ((...) - 1) * t

      const term1 = model.paa * Math.exp(model.paa_dec * t);
      const term2 = 1 - Math.exp(model.ecp_del * t);
      const term3 = 1 + model.ecp_dec * Math.exp(model.ecp_dec_del / t);

      const etaun = ((mmpData[i] - term1) / model.ecp / term2 / term3 - 1) * t;

      if (model.etau < etaun) {
        model.etau = etaun;
      }
    }

    // 3. 估计 paa_dec (Anaerobic Decay)
    model.paa_dec = paa_dec_min;
    for (let i = i1; i <= i2; i++) {
      if (i === 0) continue;
      const t = i / 60.0;
      // P = paa * exp(paa_dec * t) + ...
      // termA = P - (ecp * term2 * term3 * term4)
      // termA = paa * exp(paa_dec * t)
      // log(termA / paa) = paa_dec * t
      // paa_dec = log(termA / paa) / t

      const term2 = 1 - Math.exp(model.ecp_del * t);
      const term3 = 1 + model.ecp_dec * Math.exp(model.ecp_dec_del / t);
      const term4 = 1 + model.etau / t;

      const termRest = model.ecp * term2 * term3 * term4;
      const termA = mmpData[i] - termRest;

      if (termA > 0 && model.paa > 0) {
        const paa_decn = Math.log(termA / model.paa) / t;
        if (model.paa_dec < paa_decn && paa_decn < paa_dec_max) {
          model.paa_dec = paa_decn;
        }
      }
    }

    // 4. 估计 paa (Anaerobic Capacity Param)
    model.paa = paa_min;
    let _avg_paa = 0.0;
    let count = 1;
    // C++ 循环 i=1 到 8 (秒)
    for (let i = 1; i <= 8; i++) {
      if (i >= mmpData.length) break;
      const t = i / 60.0;

      const term2 = 1 - Math.exp(model.ecp_del * t);
      const term3 = 1 + model.ecp_dec * Math.exp(model.ecp_dec_del / t);
      const term4 = 1 + model.etau / t;
      const termRest = model.ecp * term2 * term3 * term4;

      const paan = (mmpData[i] - termRest) / Math.exp(model.paa_dec * t);

      _avg_paa = ((count - 1) * _avg_paa + paan) / count;

      if (model.paa < paan) {
        model.paa = paan;
      }
      count++;
    }

    if (_avg_paa < 0.95 * model.paa) {
      model.paa = _avg_paa;
    }

    // 5. 估计 ecp_dec (CP Decay)
    if (!withoutEcpDec && laeRange) {
      model.ecp_dec = ecp_dec_min;
      // C++ 循环步长 120 (2分钟)
      const [i7, i8] = laeRange;
      for (let i = i7; i <= i8; i += 120) {
        if (i >= mmpData.length) break;
        if (i === 0) continue;
        const t = i / 60.0;

        // P = term1 + ecp * term2 * (1 + ecp_dec * termE) * term4
        // (P - term1) / (ecp * term2 * term4) = 1 + ecp_dec * termE
        // ecp_dec * termE = (...) - 1
        // ecp_dec = ((...) - 1) / termE

        const term1 = model.paa * Math.exp(model.paa_dec * t);
        const term2 = 1 - Math.exp(model.ecp_del * t);
        const term4 = 1 + model.etau / t;
        const termE = Math.exp(model.ecp_dec_del / t);

        const numerator = (mmpData[i] - term1) / model.ecp / term2 / term4 - 1;
        let ecp_decn = numerator / termE;

        if (ecp_decn > 0) ecp_decn = 0;
        if (model.ecp_dec < ecp_decn) {
          model.ecp_dec = ecp_decn;
        }
      }
    }
  } while (
    Math.abs(model.etau - etau_prev) > etau_delta_max ||
    Math.abs(model.paa - paa_prev) > paa_delta_max ||
    Math.abs(model.paa_dec - paa_dec_prev) > paa_dec_delta_max ||
    Math.abs(model.ecp_del - ecp_del_prev) > ecp_del_delta_max ||
    Math.abs(model.ecp_dec - ecp_dec_prev) > ecp_dec_delta_max
  );

  options?.onDiagnostics?.({
    converged:
      iteration <= max_loops + 1 &&
      Object.values(model)
        .filter((v) => typeof v === 'number')
        .every(Number.isFinite),
    iterations: iteration,
  });

  // 验证最小值
  // verifyMin(model.paa, paa_min, model.paa_dec, paa_dec_min, model.ecp_dec, ecp_dec_min, model.etau, etau_min);
  if (model.paa < paa_min) model.paa = paa_min;
  if (model.paa_dec < paa_dec_min) model.paa_dec = paa_dec_min;
  if (model.ecp_dec < ecp_dec_min) model.ecp_dec = ecp_dec_min;
  if (model.etau < etau_min) model.etau = etau_min;

  // 计算 pMax (1秒) 和 mmp60 (60分钟)
  const calcP = (t: number) => {
    return (
      model.paa * Math.exp(model.paa_dec * t) +
      model.ecp *
        (1 - Math.exp(model.ecp_del * t)) *
        (1 + model.ecp_dec * Math.exp(model.ecp_dec_del / t)) *
        (1 + model.etau / t)
    );
  };

  model.pMax = calcP(1.0 / 60.0);
  model.mmp60 = calcP(60.0);

  // 计算 W' (Joules)
  // W' = Integral(paa * exp(paa_dec * t)) from 0 to infinity
  //    = paa * [-1/paa_dec * exp(paa_dec * t)]_0^inf
  //    = paa * (0 - (-1/paa_dec)) = -paa / paa_dec
  // Since t is in minutes, result is Watt-minutes. Multiply by 60 to get Joules.
  if (model.paa_dec !== 0) {
    model.wPrime = (-model.paa / model.paa_dec) * 60.0;
  } else {
    model.wPrime = 0;
  }

  return model;
}
