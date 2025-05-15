import styles from "./barsChart.module.css";
import { useCallback, useMemo, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { timelinePlugin } from "./txnBarsPlugin";
import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import UplotReact from "../../../../uplotReact/uplot-react";
import AutoSizer from "react-virtualized-auto-sizer";
import { SlotTransactions } from "../../../../api/types";
import { tooltipPlugin } from "./tooltipPlugin";
import { tooltipTxnIdxAtom, tooltipTxnStateAtom } from "./chartTooltipAtoms";
import { timeScaleDragPlugin } from "./scaleDragPlugin";
import { getChartData } from "./chartUtils";
import { addPrevSeries, barCountAtom, chartFiltersAtom } from "./atoms";
import { wheelZoomPlugin } from "./wheelZoomPlugin";
import { uplotActionAtom } from "../../../../uplotReact/atoms";

interface BarsChartProps {
  bankIdx: number;
  transactions: SlotTransactions;
  maxTs: number;
  isLastChart?: boolean;
  hide?: boolean;
  isSelected?: boolean;
}

export default function BarsChart({
  bankIdx,
  transactions,
  maxTs,
  isLastChart,
  hide,
  isSelected,
}: BarsChartProps) {
  const uplotAction = useSetAtom(uplotActionAtom);

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
      u.setData(
        getChartData(
          transactions,
          bankIdx,
          maxTs,
          Object.values(getDefaultStore().get(chartFiltersAtom)),
        ),
        false,
      );
      requestAnimationFrame(() => addPrevSeries(u, bankIdx));
    },
    [bankIdx, maxTs, transactions],
  );

  const chartDataRef = useRef(chartData);
  chartDataRef.current = chartData;

  const setTxnIdx = useSetAtom(tooltipTxnIdxAtom);
  const setTxnState = useSetAtom(tooltipTxnStateAtom);

  const options = useMemo<uPlot.Options | undefined>(() => {
    if (!chartData?.length) return;

    const rechartsRect = document
      .querySelector(".recharts-cartesian-grid")
      ?.getBoundingClientRect();

    const xOffsetLeft = Math.max(
      (rechartsRect?.x ?? 0) -
        (containerRef.current?.getBoundingClientRect().x ?? 20),
      66.5,
    );

    const rechartsRight = (rechartsRect?.x ?? 0) + (rechartsRect?.width ?? 0);
    const containerRight =
      (containerRef.current?.getBoundingClientRect().x ?? 0) +
      (containerRef.current?.getBoundingClientRect().width ?? 0);
    const xOffsetRight = Math.max(containerRight - rechartsRight, 73.5);

    return {
      width: 0,
      height: 0,
      class: styles.chart,
      drawOrder: ["series", "axes"] as uPlot.DrawOrderKey[],
      scales: { x: { time: false } },
      axes: [
        {
          stroke: "gray",
          values: (self, ticks) => {
            return isLastChart
              ? ticks.map((rawValue) => rawValue / 1_000_000 + "ms")
              : [];
          },
          size: isLastChart ? 40 : 0,
          space: 100,
          grid: { stroke: "rgba(250, 250, 250, 0.05)" },
        },
        {
          stroke: "#777b84",
          grid: { show: false },
          show: false,
        },
      ],
      legend: { markers: { width: 0 }, show: false },
      padding: [null, xOffsetRight, null, xOffsetLeft],
      series: [{ label: "Time" }, { label: `Bank ${bankIdx}` }, {}],
      plugins: [
        timelinePlugin(chartDataRef, transactionsRef),
        tooltipPlugin({ transactionsRef, setTxnIdx, setTxnState }),
        timeScaleDragPlugin(),
        wheelZoomPlugin({ factor: 0.75, uplotAction }),
      ],
    };
  }, [
    bankIdx,
    chartData?.length,
    isLastChart,
    setTxnIdx,
    setTxnState,
    uplotAction,
  ]);

  const barCount = useAtomValue(barCountAtom);

  if (!chartData || !options || hide) return null;

  return (
    <div
      style={{
        flex: 1,
        borderBottom: isLastChart
          ? undefined
          : ".5px solid rgba(255, 255, 255, .1)",
        paddingBottom: isLastChart ? 0 : 1,
        paddingTop: 1,
        display: hide ? "none" : "block",
        height: hide
          ? 0
          : isSelected
            ? `${Math.max(2, barCount) * 90 + 40}px`
            : isLastChart
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
                id={`${bankIdx}`}
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
