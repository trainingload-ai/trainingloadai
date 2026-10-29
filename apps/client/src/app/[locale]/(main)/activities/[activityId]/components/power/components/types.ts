// 功率区间数据类型
export type PowerZone = {
  name: string;
  min: number;
  max: number;
  color: string;
  description: string;
};

// 功率区间分析数据类型
export type PowerZoneData = {
  zone: PowerZone;
  duration: number; // 秒
  percentage: number;
  averagePower: number;
};
