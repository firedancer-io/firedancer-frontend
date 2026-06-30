import { Box } from "@radix-ui/themes";
import { xRangeMs } from "../../../../api/worker/cache/shreds/shredsCalc";
import { useRef, useCallback, useMemo, useEffect, memo } from "react";
import type { AlignedData } from "uplot";
import {
  chartAxisColor,
  gridLineColor,
  gridTicksColor,
} from "../../../../colors";
import UplotReact from "../../../../uplotReact/UplotReact";
import { shredsXScaleKey } from "../shredsProgressionPlugin";
import { getXIncrs, chartXPadding } from "../utils";

export const xAxisHeight = 30;

interface ChartAxesProps {
  chartId: string;
  scale: number;
  containerWidth: number;
  containerHeight: number;
}

export const MChartAxes = memo(function ChartAxes({
  chartId,
  scale,
  containerWidth,
  containerHeight,
}: ChartAxesProps) {
  const width = containerWidth + 2 * chartXPadding;
  const uplotRef = useRef<uPlot>();

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
          size: xAxisHeight,
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
    };
  }, [xIncrs]);

  options.width = width;
  options.height = containerHeight;

  return (
    <Box
      position="absolute"
      left={`-${chartXPadding}px`}
      right={`-${chartXPadding}px`}
      top="0"
      bottom="0"
      style={{ zIndex: 0 }}
    >
      <UplotReact
        id={chartId}
        options={options}
        data={chartData}
        onCreate={handleCreate}
        setSizeDebounceMs={0}
      />
    </Box>
  );
});
