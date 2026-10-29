import React from "react";

import ChartContainer from "@/components/ChartContainer";

type ActivityChartContainerProps = React.ComponentProps<typeof ChartContainer>;

/**
 * Activity detail charts share the desktop plotting surface while using the
 * roomier mobile card treatment below the PC breakpoint.
 */
const ActivityChartContainer = React.forwardRef<
  HTMLDivElement,
  ActivityChartContainerProps
>((props, ref) => (
  <ChartContainer {...props} ref={ref} appearance="activity-detail" />
));

ActivityChartContainer.displayName = "ActivityChartContainer";

export default ActivityChartContainer;
