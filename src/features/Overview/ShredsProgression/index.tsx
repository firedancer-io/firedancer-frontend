import { lazy, Suspense } from "react";
import { Box, Flex } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { ShredsChartLegend } from "./ShredsChartLegend";
import { isFrankendancer } from "../../../client";
import {
  isWebgl2SupportedAtom,
  offscreenChartFailedAtom,
} from "../../WebGl/atoms";

// Lazy-load so Three.js is split into its own chunk, downloaded only when the
// WebGL shreds chart mounts.
const ShredsChartWebGl = lazy(() => import("./WebGl/Chart"));
// OffscreenCanvas worker variant: three.js loads and renders in a worker,
// keeping its chunk eval and draw loop off the main thread entirely.
const ShredsChartOffscreen = lazy(
  () => import("./WebGl/offscreen/OffscreenChart"),
);
// Canvas (uPlot) fallback
const ShredsChartCanvas = lazy(() => import("./ShredsChart"));

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
        <Suspense fallback={<Box height="400px" />}>
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
        </Suspense>
      </Flex>
    </Card>
  );
}
