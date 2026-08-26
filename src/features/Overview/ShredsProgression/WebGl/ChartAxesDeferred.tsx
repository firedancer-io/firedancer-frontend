import { startTransition, useEffect, useState } from "react";
import type { ComponentType } from "react";
import type { ChartAxesProps } from "./ChartAxes";

let chartAxes: ComponentType<ChartAxesProps> | undefined;

/**
 * Preload-and-reveal mount of the uplot axes overlay (never suspends, so
 * it can't starve in Suspense retry lanes under data flushes): keeps
 * uplot out of the main chunk. The axes Box is absolutely positioned, so
 * the deferred mount shifts nothing.
 */
export function MChartAxesDeferred(props: ChartAxesProps) {
  const [Axes, setAxes] = useState(() => chartAxes);
  useEffect(() => {
    if (Axes) return;
    let cancelled = false;
    void import("./ChartAxes").then((m) => {
      chartAxes = m.MChartAxes;
      if (!cancelled) startTransition(() => setAxes(() => m.MChartAxes));
    });
    return () => {
      cancelled = true;
    };
  }, [Axes]);
  return Axes ? <Axes {...props} /> : null;
}
