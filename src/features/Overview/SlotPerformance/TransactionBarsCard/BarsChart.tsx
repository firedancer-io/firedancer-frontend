import styles from "./barsChart.module.css";
import { useCallback, useMemo, useRef } from "react";
import type uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { txnBarsPlugin } from "./txnBarsPlugin";
import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import UplotReact from "../../../../uplotReact/UplotReact";
import AutoSizer from "react-virtualized-auto-sizer";
import type { SlotTransactions } from "../../../../api/types";
import { tooltipTxnIdxAtom, tooltipTxnStateAtom } from "./chartTooltipAtoms";
import { timeScaleDragPlugin } from "./scaleDragPlugin";
import { getChartData, getUplotId } from "./chartUtils";
import { addPrevSeries, barCountAtom, chartFiltersAtom } from "./atoms";
import { safeDivide } from "../../../../mathUtils";
import { txnBarsTooltipPlugin } from "./txnBarsTooltipPlugin";
import { wheelZoomPlugin } from "../../../../uplotReact/wheelZoomPlugin";
import { syncXScalePlugin } from "../../../../uplotReact/syncXScalePlugin";
import { leftAxisSizeAtom, rightAxisSizeAtom } from "../ComputeUnitsCard/atoms";
import { touchPlugin } from "../../../../uplotReact/touchPlugin";
import { chartAxisColor, chartGridStrokeColor } from "../../../../colors";

/** Buffer of the canvas past the axes of the chart to prevent the first and last tick labels from being cut off */
const xBuffer = 20;

interface BarsChartProps {
  bankIdx: number;
  transactions: SlotTransactions;
  maxTs: number;
  isFirstChart?: boolean;
  isLastChart?: boolean;
  hide?: boolean;
  isSelected?: boolean;
}

export default function BarsChart({
  bankIdx,
  transactions,
  maxTs,
  isFirstChart,
  isLastChart,
  hide,
  isSelected,
}: BarsChartProps) {
  const isFirstOrLastChart = isFirstChart || isLastChart;
  const leftAxisSize = useAtomValue(leftAxisSizeAtom) - xBuffer;
  const rightAxisSize = useAtomValue(rightAxisSizeAtom) - xBuffer;

  const setTxnIdx = useSetAtom(tooltipTxnIdxAtom);
  const setTxnState = useSetAtom(tooltipTxnStateAtom);

  const containerRef = useRef<HTMLDivElement>(null);
  const transactionsRef = useRef<SlotTransactions>(transactions);
  transactionsRef.current = transactions;
  const chartData = useMemo<uPlot.AlignedData | undefined>(() => {
    return getChartData(
      transactions,
      bankIdx,
      maxTs,
      Object.values(getDefaultStore().get(chartFiltersAtom)),
    );
  }, [bankIdx, maxTs, transactions]);

  const handleCreate = useCallback(
    (u: uPlot) => {
      // Resets the data if it was mutated by uplot internally
      u.setData(
        getChartData(
          transactions,
          bankIdx,
          maxTs,
          Object.values(getDefaultStore().get(chartFiltersAtom)),
        ),
        false,
      );
    },
    [bankIdx, maxTs, transactions],
  );

  const options = useMemo<uPlot.Options | undefined>(() => {
    if (!chartData?.length) return;

    return {
      width: 0,
      height: 0,
      class: styles.chart,
      drawOrder: ["series", "axes"] as uPlot.DrawOrderKey[],
      scales: { x: { time: false } },
      axes: [
        {
          stroke: chartAxisColor,
          values: (self, ticks) => {
            return isFirstOrLastChart
              ? ticks.map((rawValue) => safeDivide(rawValue, 1_000_000) + "ms")
              : [];
          },
          size: isFirstOrLastChart ? 40 : 0,
          space: 100,
          grid: { stroke: chartGridStrokeColor },
          border: {
            show: true,
            width: 1 / devicePixelRatio,
            stroke: chartAxisColor,
          },
          ticks: {
            width: 1 / devicePixelRatio,
            stroke: chartAxisColor,
            size: 5,
          },
          side: isFirstChart ? 0 : 2,
        },
        {
          border: {
            show: true,
            width: 1 / devicePixelRatio,
            stroke: chartAxisColor,
          },
          stroke: "rgba(0,0,0,0)",
        },
      ],
      legend: { markers: { width: 0 }, show: false },
      padding: [0, xBuffer, 0, xBuffer],
      series: [{ label: "Time" }, { label: `Bank ${bankIdx}` }, {}],
      plugins: [
        txnBarsPlugin(transactionsRef),
        txnBarsTooltipPlugin({ transactionsRef, setTxnIdx, setTxnState }),
        timeScaleDragPlugin(),
        wheelZoomPlugin({ factor: 0.75 }),
        syncXScalePlugin(),
        touchPlugin(),
      ],
      hooks: {
        ready: [
          (u) => {
            requestAnimationFrame(() => {
              addPrevSeries(u, bankIdx);
            });
          },
        ],
      },
    };
  }, [
    bankIdx,
    chartData?.length,
    isFirstChart,
    isFirstOrLastChart,
    setTxnIdx,
    setTxnState,
  ]);

  const barCount = useAtomValue(barCountAtom);

  if (!chartData || !options || hide) return null;

  return (
    <div
      style={{
        flex: 1,
        marginLeft: `${leftAxisSize}px`,
        marginRight: `${rightAxisSize}px`,
        display: hide ? "none" : "block",
        height: isSelected
          ? `${Math.max(2, barCount) * 90 + 40}px`
          : // Only the first and last charts have a visible labeled x axis
            isFirstOrLastChart
            ? "170px"
            : "130px",
      }}
      ref={containerRef}
    >
      <AutoSizer>
        {({ height, width }) => {
          options.width = width;
          options.height = height;
          return (
            <>
              <UplotReact
                id={getUplotId(bankIdx)}
                options={options}
                data={chartData}
                onCreate={handleCreate}
              />
            </>
          );
        }}
      </AutoSizer>
    </div>
  );
}
