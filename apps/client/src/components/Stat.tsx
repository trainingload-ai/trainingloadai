"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import NumberFlow from "@number-flow/react";
import ChangePercentage from "@/components/ChangePercentage";

interface StatProps {
  title: string;
  id: string;
  value: number;
  prevValue: number;
  decimals?: number;
  isLoading: boolean;
  reverseColor?: boolean;
}

const Stat = (props: StatProps) => {
  const {
    title,
    value,
    isLoading,
    prevValue,
    decimals = 1,
    reverseColor = false,
  } = props;
  return (
    <div
      className={cn(
        "flex flex-col border-r border-neutral-100 dark:border-neutral-600 last:border-r-0 text-nowrap",
        //   selectedStat === id && "bg-neutral-850"
      )}
      // onClick={() => setSelectedStat(id)}
    >
      <div className="flex flex-col px-3 py-2">
        <div className="text-sm font-medium text-muted-foreground">{title}</div>
        <div className="text-2xl font-medium flex gap-2 items-center justify-between">
          {isLoading ? (
            <>
              <Skeleton className="w-[60px] h-9 rounded-md" />
              <Skeleton className="w-[50px] h-5 rounded-md" />
            </>
          ) : (
            <>
              <span>
                {
                  <NumberFlow
                    respectMotionPreference={false}
                    value={decimals ? Number(value.toFixed(decimals)) : value}
                    format={{ notation: "compact" }}
                  />
                }
                {/* {postfix && <span>{postfix}</span>} */}
              </span>
              <ChangePercentage
                current={value}
                previous={prevValue}
                reverseColor={reverseColor}
              />
            </>
          )}
        </div>
      </div>
      {/* chart */}
      <div className="h-[40px] mt-[-16]">
        {/* <SparklinesChart data={sparklinesData} isHovering={isHovering} /> */}
      </div>
    </div>
  );
};

export default Stat;
