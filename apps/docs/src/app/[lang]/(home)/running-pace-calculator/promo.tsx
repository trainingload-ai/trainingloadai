import { CalculatorPromo } from "@/components/calculators/app-promo";

export function RunningPaceAppPromo({ lang }: { lang: string }) {
  return (
    <CalculatorPromo
      lang={lang}
      toolId="running_pace_calculator"
      namespace="runningPaceCalculator.page.promo"
      variant="recording"
    />
  );
}
