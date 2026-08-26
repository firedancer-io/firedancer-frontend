import { startTransition, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { Box, Flex } from "@radix-ui/themes";
import type { FlexProps } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { ShredsChartLegend } from "./ShredsChartLegend";
import { isFrankendancer } from "../../../client";
import {
  isWebgl2SupportedAtom,
  offscreenChartFailedAtom,
} from "../../WebGl/atoms";
// Eager: both are small (three.js lives in the chart worker chunk, uplot
// is already in the main bundle), and a lazy chunk mounting under live
// data flushes can starve in Suspense retry lanes indefinitely.
import ShredsChartOffscreen from "./WebGl/offscreen/OffscreenChart";
import ShredsChartCanvas from "./ShredsChart";

interface WebGlChartProps
  extends Pick<FlexProps, "height" | "minHeight" | "flexGrow"> {
  chartId: string;
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
  return Chart ? <Chart {...props} /> : <Box height={props.height} />;
}

const isOffscreenSupported =
  typeof Worker !== "undefined" &&
  typeof OffscreenCanvas !== "undefined" &&
  typeof HTMLCanvasElement !== "undefined" &&
  !!HTMLCanvasElement.prototype.transferControlToOffscreen;

export default function ShredsProgression() {
  const webgl2Supported = useAtomValue(isWebgl2SupportedAtom);
  const offscreenFailed = useAtomValue(offscreenChartFailedAtom);

  if (isFrankendancer) return;

  return (
    // extra right padding for x axis label
    <Card style={{ padding: "10px 13px 10px 10px" }}>
      <Flex direction="column" gap="4">
        <Flex gapX="15px" gapY="2" align="center" wrap="wrap">
          <CardHeader text="Shreds" />
          <ShredsChartLegend />
        </Flex>
        {isOffscreenSupported && !offscreenFailed ? (
          <ShredsChartOffscreen
            height="400px"
            chartId="overview-shreds-chart"
          />
        ) : webgl2Supported ? (
          <ShredsChartWebGl height="400px" chartId="overview-shreds-chart" />
        ) : (
          <ShredsChartCanvas
            height="400px"
            chartId="overview-shreds-chart"
            isOnStartupScreen={false}
          />
        )}
      </Flex>
    </Card>
  );
}
