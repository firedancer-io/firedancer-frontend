import UplotReact from "../../../uplotReact/UplotReact";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type uPlot from "uplot";
import { chartAxisColor, gridLineColor, gridTicksColor } from "../../../colors";
import type { AlignedData } from "uplot";
import { xRangeMs } from "./const";
import { useMeasure, useMedia, useRafLoop } from "react-use";
import {
  shredsProgressionPlugin,
  shredsXScaleKey,
} from "./shredsProgressionPlugin";
import { Box, Flex } from "@radix-ui/themes";
import ShredsSlotLabels from "./ShredsSlotLabels";

const REDRAW_INTERVAL_MS = 40;

// prevent x axis tick labels from being cut off
const chartXPadding = 15;

const minXIncrRange = {
  min: 200,
  max: 1_600,
};

/**
 * Get dynamic x axis tick increments based on chart scale
 */
const getXIncrs = (scale: number) => {
  const scaledIncr = scale * minXIncrRange.max;
  // round to multiples of minimum increment
  const minIncrMultiple =
    Math.trunc(scaledIncr / minXIncrRange.min) * minXIncrRange.min;

  const incrs = [minIncrMultiple];
  while (incrs[incrs.length - 1] < xRangeMs * scale) {
    incrs.push(incrs[incrs.length - 1] * 2);
  }
  return incrs;
};

interface ShredsChartProps {
  chartId: string;
  isOnStartupScreen: boolean;
}
export default function ShredsChart({
  chartId,
  isOnStartupScreen,
}: ShredsChartProps) {
  const isXL = useMedia("(max-width: 2100px)");
  const isL = useMedia("(max-width: 1800px)");
  const isM = useMedia("(max-width: 1500px)");
  const isS = useMedia("(max-width: 1200px)");
  const isXS = useMedia("(max-width: 900px)");
  const isXXS = useMedia("(max-width: 600px)");
  const scale = isXXS
    ? 1 / 7
    : isXS
      ? 2 / 7
      : isS
        ? 3 / 7
        : isM
          ? 4 / 7
          : isL
            ? 5 / 7
            : isXL
              ? 6 / 7
              : 1;

  const uplotRef = useRef<uPlot>();
  const lastRedrawRef = useRef(0);
  const [measureRef, measureRect] = useMeasure<HTMLDivElement>();

  const handleCreate = useCallback((u: uPlot) => {
    uplotRef.current = u;
  }, []);

  const [chartData, xIncrs] = useMemo(() => {
    return [
      [[Math.trunc(scale * -xRangeMs), 0], new Array(2)] satisfies AlignedData,
      getXIncrs(scale),
    ];
  }, [scale]);

  useEffect(() => {
    if (!uplotRef.current) return;
    uplotRef.current.axes[0].incrs = () => xIncrs;
    uplotRef.current.setData(chartData, true);
  }, [chartData, xIncrs]);

  const options = useMemo<uPlot.Options>(() => {
    return {
      padding: [0, chartXPadding, 0, chartXPadding],
      width: 0,
      height: 0,
      scales: {
        [shredsXScaleKey]: { time: false },
        y: {
          time: false,
          range: [0, 1],
        },
      },
      series: [{ scale: shredsXScaleKey }, {}],
      cursor: {
        show: false,
        drag: {
          // disable zoom
          [shredsXScaleKey]: false,
          y: false,
        },
      },
      legend: { show: false },
      axes: [
        {
          scale: shredsXScaleKey,
          incrs: xIncrs,
          size: 30,
          ticks: {
            opacity: 0.2,
            stroke: chartAxisColor,
            size: 5,
            width: 1 / devicePixelRatio,
          },
          values: (_, ticks) =>
            // special label for right-most tick
            ticks.map((val) =>
              val === 0 ? "now" : `${(val / 1_000).toFixed(1)}s`,
            ),
          grid: {
            stroke: gridLineColor,
            width: 1 / devicePixelRatio,
          },
          stroke: gridTicksColor,
        },
        {
          size: 0,
          grid: {
            filter: () => [0],
            stroke: gridTicksColor,
            width: 1,
          },
        },
      ],
      plugins: [shredsProgressionPlugin(isOnStartupScreen)],
    };
  }, [isOnStartupScreen, xIncrs]);

  options.width = measureRect.width;
  options.height = measureRect.height;

  useRafLoop((time: number) => {
    if (!uplotRef) return;
    if (
      lastRedrawRef.current == null ||
      time - lastRedrawRef.current >= REDRAW_INTERVAL_MS
    ) {
      lastRedrawRef.current = time;
      uplotRef.current?.redraw(true, false);
    }
  });

  return (
    <Flex direction="column" gap="2px" height="100%">
      {!isOnStartupScreen && <ShredsSlotLabels />}
      <Box
        flexGrow="1"
        minHeight="0"
        mx={`-${chartXPadding}px`}
        ref={measureRef}
      >
        <UplotReact
          id={chartId}
          options={options}
          data={chartData}
          onCreate={handleCreate}
        />
      </Box>
    </Flex>
  );
}
