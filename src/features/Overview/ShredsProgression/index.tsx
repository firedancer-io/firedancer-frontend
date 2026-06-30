import { lazy, Suspense } from "react";
import { Box, Flex } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { ShredsChartLegend } from "./ShredsChartLegend";
import { isFrankendancer } from "../../../client";

// Lazy-load so Three.js is split into its own chunk, downloaded only when the
// shreds chart mounts.
const ShredsChartWebGl = lazy(() => import("./WebGl/Chart"));

export default function ShredsProgression() {
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
          <ShredsChartWebGl height="400px" chartId="overview-shreds-chart" />
        </Suspense>
      </Flex>
    </Card>
  );
}
