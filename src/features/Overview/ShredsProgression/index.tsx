import { Flex } from "@radix-ui/themes";
import UplotReact from "../../../uplotReact/UplotReact";
import AutoSizer from "react-virtualized-auto-sizer";
import { useCallback, useMemo, useRef } from "react";
import type uPlot from "uplot";
import { chartAxisColor, gridLineColor, gridTicksColor } from "../../../colors";
import type { AlignedData } from "uplot";
import { xRangeMs } from "./const";
import { shredsProgressionPlugin } from "./shredsProgressionPlugin";
import { useRafLoop } from "react-use";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";

const REDRAW_INTERVAL_MS = 40;

const chartId = "shreds-progression-chart";
const chartData: AlignedData = [[-xRangeMs, 0], new Array(2)];

const minXIncrement = 400;
const getXIncrs = () => {
  const incrs = [minXIncrement];
  while (incrs[incrs.length - 1] < xRangeMs) {
    incrs.push(incrs[incrs.length - 1] * 2);
  }
  return incrs;
};
const xIncrs = getXIncrs();

interface ShredsProgressionProps {
  title: string;
  chartHeight: number;
  drawOnlyDots?: boolean;
  drawOnlyBeforeFirstTurbine?: boolean;
  pauseDuringStartup?: boolean;
}
export default function ShredsProgression({
  title,
  chartHeight,
  drawOnlyDots = false,
  drawOnlyBeforeFirstTurbine = false,
  pauseDuringStartup = false,
}: ShredsProgressionProps) {
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
            ticks.map((val) => (val === 0 ? "now" : `${val}`)),
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
          pauseDuringStartup,
        ),
      ],
    };
  }, [drawOnlyBeforeFirstTurbine, drawOnlyDots, pauseDuringStartup]);

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
    <Card>
      <Flex direction="column" gap="4">
        <CardHeader text={title} />
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
      </Flex>
    </Card>
  );
}
