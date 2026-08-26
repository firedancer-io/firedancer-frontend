import styles from "./barsChart.module.css";
import { useCallback, useMemo, useRef } from "react";
import type uPlot from "uplot";
import { txnBarsPlugin } from "./txnBarsPlugin";
import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import UplotReact from "../../../../uplotReact/UplotReact";
import { useMeasure } from "react-use";
import { useDebounce } from "use-debounce";
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
import { banksXScaleKey } from "../ComputeUnitsCard/consts";
import { getTxnBundleStats } from "../../../../transactionUtils";
import clsx from "clsx";
import { barChartAxisSize, barChartXBuffer } from "./consts";

const store = getDefaultStore();

interface BarsChartProps {
  bankIdx: number;
  transactions: SlotTransactions;
  maxTs: number;
  rowHeight: number;
  hasAxis?: boolean;
  hasTopAxis?: boolean;
  isFocused?: boolean;
}

const resizeDebounceMs = 500;

export default function BarsChart({
  bankIdx,
  transactions,
  maxTs,
  rowHeight,
  hasAxis,
  hasTopAxis,
  isFocused,
}: BarsChartProps) {
  const leftAxisSize = Math.max(
    0,
    useAtomValue(leftAxisSizeAtom) - barChartXBuffer,
  );
  const rightAxisSize = Math.max(
    0,
    useAtomValue(rightAxisSizeAtom) - barChartXBuffer,
  );
  const yAxisHeight = hasAxis ? barChartAxisSize : 0;

  const setTxnIdx = useSetAtom(tooltipTxnIdxAtom);
  const setTxnState = useSetAtom(tooltipTxnStateAtom);

  const [containerRef, { width: measuredWidth }] = useMeasure<HTMLDivElement>();
  const [width] = useDebounce(measuredWidth, resizeDebounceMs, {
    leading: true,
    trailing: true,
    maxWait: resizeDebounceMs,
  });
  const transactionsRef = useRef<SlotTransactions>(transactions);
  transactionsRef.current = transactions;
  const chartData = useMemo<uPlot.AlignedData | undefined>(() => {
    return getChartData(
      transactions,
      bankIdx,
      maxTs,
      Object.values(store.get(chartFiltersAtom)),
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
          Object.values(store.get(chartFiltersAtom)),
        ),
        false,
      );
    },
    [bankIdx, maxTs, transactions],
  );

  const transactionsBundleStats = useMemo(() => {
    return transactions.txn_from_bundle.map((from_bundle, i) => {
      if (!from_bundle) return;

      return getTxnBundleStats(transactions, i);
    });
  }, [transactions]);

  const options = useMemo<uPlot.Options | undefined>(() => {
    if (!chartData?.length) return;

    return {
      width: 0,
      height: 0,
      class: styles.chart,
      drawOrder: ["series", "axes"] as uPlot.DrawOrderKey[],
      scales: { [banksXScaleKey]: { time: false } },
      axes: [
        {
          scale: banksXScaleKey,
          stroke: chartAxisColor,
          values: (self, ticks) => {
            return hasAxis
              ? ticks.map((rawValue) => safeDivide(rawValue, 1_000_000) + "ms")
              : [];
          },
          size: yAxisHeight,
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
          side: hasTopAxis ? 0 : 2,
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
      padding: [0, barChartXBuffer, 0, barChartXBuffer],
      series: [{ scale: banksXScaleKey }, { label: `Bank ${bankIdx}` }, {}],
      plugins: [
        txnBarsPlugin(transactionsRef, transactionsBundleStats),
        txnBarsTooltipPlugin({
          transactionsRef,
          setTxnIdx,
          setTxnState,
          transactionsBundleStats,
        }),
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
    yAxisHeight,
    hasTopAxis,
    hasAxis,
    setTxnIdx,
    setTxnState,
    transactionsBundleStats,
  ]);

  const barCount = useAtomValue(barCountAtom);

  if (!chartData || !options) return null;

  const chartHeight = Math.max(1, barCount) * rowHeight + yAxisHeight;
  options.width = width;
  options.height = chartHeight;

  return (
    <div
      style={{
        flex: 1,
        marginLeft: `${leftAxisSize}px`,
        marginRight: `${rightAxisSize}px`,
        height: `${chartHeight}px`,
      }}
      ref={containerRef}
    >
      {width > 0 && (
        <UplotReact
          id={getUplotId(bankIdx)}
          className={clsx(isFocused && styles.focused)}
          options={options}
          data={chartData}
          onCreate={handleCreate}
          setSizeDebounceMs={resizeDebounceMs}
        />
      )}
    </div>
  );
}
