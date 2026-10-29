import React from "react";
import PowerStat from "../../power/components/power-stat";

// 心率统计组件属性
export interface HeartRateStatProps {
  title: string;
  value?: string | number;
  unit?: string;
  extraRight?: React.ReactNode;
  extraRightNoStyle?: boolean;
  extraRightPlain?: boolean;
  color?: string;
  className?: string;
  variant?: "grid" | "row";
}

const HeartRateStat: React.FC<HeartRateStatProps> = ({
  title,
  value,
  unit,
  extraRight,
  extraRightNoStyle = false,
  extraRightPlain = false,
  color,
  className,
  variant = "grid",
}) => {
  return (
    <PowerStat
      title={title}
      value={value ?? "--"}
      unit={unit}
      color={color}
      extraRight={extraRight}
      extraRightNoStyle={extraRightNoStyle}
      extraRightPlain={extraRightPlain}
      className={className}
      variant={variant}
    />
  );
};

export default HeartRateStat;
