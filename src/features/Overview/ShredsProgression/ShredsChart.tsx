import UplotReact from "../../../uplotReact/UplotReact";
import AutoSizer from "react-virtualized-auto-sizer";
import { useCallback, useMemo, useRef } from "react";
import type uPlot from "uplot";
import { chartAxisColor, gridLineColor, gridTicksColor } from "../../../colors";
import type { AlignedData } from "uplot";
import { xRangeMs } from "./const";
import { shredsProgressionPlugin } from "./shredsProgressionPlugin";
import { useRafLoop } from "react-use";

const REDRAW_INTERVAL_MS = 40;

const chartData: AlignedData = [[-xRangeMs, 0], new Array(2)];

const minXIncrement = 1600;
const getXIncrs = () => {
  const incrs = [minXIncrement];
  while (incrs[incrs.length - 1] < xRangeMs) {
    incrs.push(incrs[incrs.length - 1] * 2);
  }
  return incrs;
};
const xIncrs = getXIncrs();

interface ShredsChartProps {
  chartId: string;
  chartHeight: number;
  drawOnlyDots?: boolean;
  drawOnlyBeforeFirstTurbine?: boolean;
  pauseDrawingDuringStartup?: boolean;
}
export default function ShredsChart({
  chartId,
  chartHeight,
  drawOnlyDots = false,
  drawOnlyBeforeFirstTurbine = false,
  pauseDrawingDuringStartup = false,
}: ShredsChartProps) {
  const uplotRef = useRef<uPlot>();
  const lastRedrawRef = useRef(0);

  const handleCreate = useCallback((u: uPlot) => {
    uplotRef.current = u;
  }, []);

  const options = useMemo<uPlot.Options>(() => {
    return {
      width: 0,
      height: 0,
      scales: {
        x: { time: false },
        y: {
          time: false,
          range: [0, 1],
        },
      },
      series: [{}, {}],
      cursor: {
        show: false,
        drag: {
          // disable zoom
          x: false,
          y: false,
        },
      },
      legend: { show: false },
      axes: [
        {
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
          values: () => [],
          grid: {
            filter: () => [0],
            stroke: gridTicksColor,
            width: 1,
          },
        },
      ],
      plugins: [
        shredsProgressionPlugin(
          drawOnlyBeforeFirstTurbine,
          drawOnlyDots,
          pauseDrawingDuringStartup,
        ),
      ],
    };
  }, [drawOnlyBeforeFirstTurbine, drawOnlyDots, pauseDrawingDuringStartup]);

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
    <div style={{ height: `${chartHeight}px` }}>
      <AutoSizer>
        {({ height, width }) => {
          options.width = width;
          options.height = height;
          return (
            <UplotReact
              id={chartId}
              options={options}
              data={chartData}
              onCreate={handleCreate}
            />
          );
        }}
      </AutoSizer>
    </div>
  );
}
