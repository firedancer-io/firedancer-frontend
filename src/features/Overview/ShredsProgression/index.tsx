import { startTransition, useEffect, useState } from "react";
import type { ComponentType, CSSProperties } from "react";
import { useAtomValue } from "jotai";
import clsx from "clsx";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { ShredsChartLegend } from "./ShredsChartLegend";
import { isFrankendancer } from "../../../client";
import {
  isOffscreenChartSupported,
  isWebgl2SupportedAtom,
  offscreenChartFailedAtom,
} from "../../WebGl/atoms";
// Eager: small (three.js lives in the chart worker chunk), and a lazy
// chunk mounting under live data flushes can starve in Suspense retry
// lanes indefinitely.
import ShredsChartOffscreen from "./WebGl/offscreen/OffscreenChart";
// Deferred (preload-and-reveal, not lazy/Suspense): keeps uplot out of
// the main chunk
import ShredsChartCanvas from "./ShredsChartDeferred";

interface WebGlChartProps {
  chartId: string;
  height?: string;
  minHeight?: string;
  flexGrow?: "0" | "1";
}
let webGlChart: ComponentType<WebGlChartProps> | undefined;

/**
 * Main-thread WebGL fallback: three.js (~500KB) stays code-split, but
 * preload-and-reveal replaces lazy/Suspense so the mount never suspends
 * (interrupted Suspense retries restart from scratch and starve under
 * sustained data flushes).
 */
function ShredsChartWebGl(props: WebGlChartProps) {
  const [Chart, setChart] = useState(() => webGlChart);
  useEffect(() => {
    if (Chart) return;
    let cancelled = false;
    void import("./WebGl/Chart").then((m) => {
      webGlChart = m.default;
      if (!cancelled) startTransition(() => setChart(() => m.default));
    });
    return () => {
      cancelled = true;
    };
  }, [Chart]);
  return Chart ? (
    <Chart {...props} />
  ) : (
    <div
      className={clsx("rt-Box", props.height !== undefined && "rt-r-h")}
      style={{ "--height": props.height } as CSSProperties}
    />
  );
}

/**
 * Mounted only when the offscreen path is unavailable, so the lazy
 * WebGL2 probe behind isWebgl2SupportedAtom runs on first actual need
 * rather than during the reveal render.
 */
function ShredsChartFallback(props: WebGlChartProps) {
  const webgl2Supported = useAtomValue(isWebgl2SupportedAtom);
  return webgl2Supported ? (
    <ShredsChartWebGl {...props} />
  ) : (
    <ShredsChartCanvas {...props} isOnStartupScreen={false} />
  );
}

export default function ShredsProgression() {
  const offscreenFailed = useAtomValue(offscreenChartFailedAtom);

  if (isFrankendancer) return;

  return (
    // extra right padding for x axis label
    <Card style={{ padding: "10px 13px 10px 10px" }}>
      <div className="rt-Flex rt-r-fd-column rt-r-gap-4">
        <div
          className="rt-Flex rt-r-ai-center rt-r-fw-wrap rt-r-cg rt-r-rg-2"
          style={{ "--column-gap": "15px" } as CSSProperties}
        >
          <CardHeader text="Shreds" />
          <ShredsChartLegend />
        </div>
        {isOffscreenChartSupported && !offscreenFailed ? (
          <ShredsChartOffscreen
            height="400px"
            chartId="overview-shreds-chart"
          />
        ) : (
          <ShredsChartFallback height="400px" chartId="overview-shreds-chart" />
        )}
      </div>
    </Card>
  );
}
