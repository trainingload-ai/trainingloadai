import React from "react";
import PowerStat from "../../power/components/power-stat";

export interface PaceStatProps {
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

const PaceStat: React.FC<PaceStatProps> = ({
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

export default PaceStat;
