import { startTransition, useEffect, useState } from "react";
import type { ComponentProps, ComponentType } from "react";
import { Box } from "@radix-ui/themes";
import type ShredsChart from "./ShredsChart";

type ShredsChartProps = ComponentProps<typeof ShredsChart>;

let shredsChart: ComponentType<ShredsChartProps> | undefined;

/**
 * Preload-and-reveal mount of the main-thread canvas fallback chart
 * (never suspends, so it can't starve in Suspense retry lanes under
 * data flushes): keeps uplot out of the main chunk. The placeholder
 * reserves the chart's box.
 */
export default function ShredsChartDeferred(props: ShredsChartProps) {
  const [Chart, setChart] = useState(() => shredsChart);
  useEffect(() => {
    if (Chart) return;
    let cancelled = false;
    void import("./ShredsChart").then((m) => {
      shredsChart = m.default;
      if (!cancelled) startTransition(() => setChart(() => m.default));
    });
    return () => {
      cancelled = true;
    };
  }, [Chart]);
  return Chart ? (
    <Chart {...props} />
  ) : (
    <Box
      height={props.height}
      minHeight={props.minHeight}
      flexGrow={props.flexGrow}
    />
  );
}
