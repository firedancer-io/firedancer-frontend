import { useCallback, useMemo, useRef } from "react";
import type { SlotTransactions } from "../../../../api/types";
import AutoSizer from "react-virtualized-auto-sizer";
import UplotReact from "../../../../uplotReact/UplotReact";
import uPlot from "uplot";
import { lamportsPerSol } from "../../../../consts";
import styles from "./../TransactionBarsCard/barsChart.module.css";
import { useAtomValue, useSetAtom } from "jotai";
import { timeScaleDragPlugin } from "../TransactionBarsCard/scaleDragPlugin";
import { cuRefAreaPlugin } from "./cuRefAreaPlugin";
import { revenueStartLinePlugin } from "./revenueStartLinePlugin";
import {
  bankScaleKey,
  computeUnitsScaleKey,
  lamportsScaleKey,
  xScaleKey,
} from "./consts";
import {
  cuChartTooltipDataAtom,
  leftAxisSizeAtom,
  rightAxisSizeAtom,
} from "./atoms";
import { cuTooltipPlugin } from "./cuTooltipPlugin";
import { wheelZoomPlugin } from "../../../../uplotReact/wheelZoomPlugin";
import { syncXScalePlugin } from "../../../../uplotReact/syncXScalePlugin";
import {
  chartBufferMs,
  getMaxTsWithBuffer,
} from "../../../../transactionUtils";
import { cuIsFullXRangePlugin } from "./cuIsFullXRangePlugin";
import { touchPlugin } from "../../../../uplotReact/touchPlugin";
import {
  chartAxisColor,
  chartGridColor,
  computeUnitsColor,
  feesColor,
  tipsColor,
} from "../../../../colors";
import { scheduleStrategyAtom } from "../../../../api/atoms";
import { ScheduleStrategyEnum } from "../../../../api/entities";

function getChartData(transactions: SlotTransactions) {
  const events = [
    ...transactions.txn_mb_start_timestamps_nanos.map((timestamp, i) => ({
      timestampNanos: Number(timestamp - transactions.start_timestamp_nanos),
      txn_idx: i,
      isTxnStart: true,
    })),
    ...transactions.txn_mb_end_timestamps_nanos.map((timestamp, i) => ({
      timestampNanos: Number(timestamp - transactions.start_timestamp_nanos),
      txn_idx: i,
      isTxnStart: false,
    })),
  ].sort((a, b) => a.timestampNanos - b.timestampNanos);

  const isBankActive: boolean[] = [];

  let maxLamports = 0;
  let maxComputeUnits = 0;
  let maxBankCount = 0;

  const chartData = events.reduce<(number | null)[][]>(
    (data, event, i) => {
      const txnIdx = event.txn_idx;
      const cuDelta = transactions.txn_landed[txnIdx]
        ? event.isTxnStart
          ? transactions.txn_compute_units_requested[txnIdx]
          : -transactions.txn_compute_units_requested[txnIdx] +
            transactions.txn_compute_units_consumed[txnIdx]
        : 0;
      const fees = // fees are only paid by landed transactions with a valid fee payer (errors 5, 6 result in an invalid fee payer)
        !event.isTxnStart &&
        transactions.txn_landed[txnIdx] &&
        ![5, 6].includes(transactions.txn_error_code[txnIdx])
          ? Number(transactions.txn_priority_fee[txnIdx]) +
            Number(transactions.txn_transaction_fee[txnIdx])
          : 0;
      const tip =
        !event.isTxnStart &&
        transactions.txn_landed[txnIdx] &&
        transactions.txn_error_code[txnIdx] === 0
          ? Number(transactions.txn_tips[txnIdx])
          : 0;

      isBankActive[transactions.txn_bank_idx[txnIdx]] = event.isTxnStart;
      const curBankCount = isBankActive.filter((isActive) => isActive).length;
      const prevIdx = data[0].length - 1;
      const curComputeUnits = (data[2][prevIdx] || 0) + cuDelta;
      const cuFees = (data[3][prevIdx] || 0) + fees;
      const curTips = (data[4][prevIdx] || 0) + tip;

      if (curBankCount > maxBankCount) maxBankCount = curBankCount;
      if (curComputeUnits > maxComputeUnits) maxComputeUnits = curComputeUnits;
      if (cuFees > maxLamports) maxLamports = cuFees;
      if (curTips > maxLamports) maxLamports = curTips;

      if (i > 0 && events[i - 1].timestampNanos === event.timestampNanos) {
        data[1][prevIdx] = curBankCount;
        data[2][prevIdx] = curComputeUnits;
        data[3][prevIdx] = cuFees;
        data[4][prevIdx] = curTips;
      } else {
        data[0].push(event.timestampNanos);
        data[1].push(curBankCount);
        data[2].push(curComputeUnits);
        data[3].push(cuFees);
        data[4].push(curTips);
      }
      return data;
    },
    [[-chartBufferMs], [0], [0], [0], [0]],
  );

  const maxTs = getMaxTsWithBuffer(transactions);

  chartData.forEach((series) => {
    series.push(null);
  });
  chartData[0][chartData[0].length - 1] = maxTs;

  return {
    chartData: chartData as uPlot.AlignedData,
    maxBankCount,
    maxComputeUnits,
    maxLamports,
  };
}

const { stepped } = uPlot.paths;
const _stepAfter = stepped?.({ align: 1 });

const paths: uPlot.Series.PathBuilder = (u, seriesIdx, idx0, idx1) => {
  const renderer = _stepAfter;
  return renderer?.(u, seriesIdx, idx0, idx1) ?? null;
};

const chartId = "cu-chart";

interface CuChartProps {
  slotTransactions: SlotTransactions;
  maxComputeUnits: number;
  bankTileCount: number;
  onCreate: (u: uPlot) => void;
}

export default function CuChart({
  slotTransactions,
  maxComputeUnits,
  bankTileCount,
  onCreate,
}: CuChartProps) {
  const scheduleStrategy = useAtomValue(scheduleStrategyAtom);

  const setTooltipData = useSetAtom(cuChartTooltipDataAtom);
  const setLeftAxisSize = useSetAtom(leftAxisSizeAtom);
  const setRightAxisSize = useSetAtom(rightAxisSizeAtom);

  const slotTransactionsRef = useRef(slotTransactions);
  slotTransactionsRef.current = slotTransactions;
  const maxComputeUnitsRef = useRef(maxComputeUnits);
  maxComputeUnitsRef.current = maxComputeUnits;
  const bankTileCountRef = useRef(bankTileCount);
  bankTileCountRef.current = bankTileCount;

  const {
    chartData,
    maxBankCount,
    maxComputeUnits: maxCuPoint,
    maxLamports,
  } = useMemo(() => getChartData(slotTransactions), [slotTransactions]);

  const isFullCuRange = useCallback(
    (minCu: number, maxCu: number) => {
      if (minCu > 0) return false;
      if (maxCu < maxCuPoint) return false;
      return true;
    },
    [maxCuPoint],
  );

  const options = useMemo<uPlot.Options>(() => {
    return {
      width: 0,
      height: 0,
      class: styles.chart,
      drawOrder: ["axes", "series"] as uPlot.DrawOrderKey[],
      cursor: {
        sync: {
          key: xScaleKey,
        },
        points: { show: false },
      },
      scales: {
        x: {
          time: false,
        },
        [computeUnitsScaleKey]: {
          range: (u, initMin, initMax) => {
            if (isFullCuRange(initMin, initMax)) {
              return [0, maxComputeUnits + 1_000_000];
            }
            const buffer = Math.max(initMax - initMin, 50_000);

            return [
              Math.max(initMin - buffer, 0),
              Math.min(initMax + buffer, maxComputeUnits + 1_000_000),
            ];
          },
        },
        [bankScaleKey]: {
          range: [0, maxBankCount + 1],
        },
        [lamportsScaleKey]: {
          range: [0, maxLamports * 1.1],
        },
      },
      axes: [
        {
          border: {
            show: true,
            width: 1 / devicePixelRatio,
            stroke: chartAxisColor,
          },
          stroke: chartAxisColor,
          grid: {
            width: 1 / devicePixelRatio,
            stroke: chartGridColor,
          },
          ticks: {
            width: 1 / devicePixelRatio,
            stroke: chartAxisColor,
            size: 5,
          },
          size: 30,
          values: (self, ticks) => {
            return ticks.map((rawValue) => rawValue / 1_000_000 + "ms");
          },
          space: 100,
        },
        {
          scale: computeUnitsScaleKey,
          border: {
            show: true,
            width: 1 / devicePixelRatio,
            stroke: chartAxisColor,
          },
          stroke: chartAxisColor,
          grid: {
            width: 1 / devicePixelRatio,
            stroke: chartGridColor,
          },
          ticks: {
            width: 1 / devicePixelRatio,
            stroke: chartAxisColor,
            size: 5,
          },
          values: (self, ticks) =>
            ticks.map((rawValue) => rawValue / 1_000_000 + "M"),
          space: 50,
          size(self, values, axisIdx, cycleNum) {
            const axis = self.axes[axisIdx];

            // bail out, force convergence
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
            if (cycleNum > 1) return (axis as any)._size;

            let axisSize = axis.ticks?.size ?? 0 + (axis.gap ?? 0);

            // adding tick gap
            axisSize += 5;

            // find longest value
            const longestVal = (values ?? []).reduce(
              (acc, val) => (val.length > acc.length ? val : acc),
              "",
            );

            if (longestVal !== "") {
              self.ctx.font = axis.font?.[0] ?? "Inter Tight";
              axisSize +=
                self.ctx.measureText(longestVal).width / devicePixelRatio;
            }
            const px = Math.ceil(axisSize);
            setLeftAxisSize(px);
            return px;
          },
        },
        {
          scale: lamportsScaleKey,
          stroke: chartAxisColor,
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
          values: (self, ticks) =>
            ticks.map((rawValue) => rawValue / lamportsPerSol + " SOL"),
          side: 1,
          space: 50,
          size(self, values, axisIdx, cycleNum) {
            const axis = self.axes[axisIdx];

            // bail out, force convergence
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
            if (cycleNum > 1) return (axis as any)._size;

            let axisSize = axis.ticks?.size ?? 0 + (axis.gap ?? 0);

            // adding tick gap
            axisSize += 5;

            // find longest value
            const longestVal = (values ?? []).reduce(
              (acc, val) => (val.length > acc.length ? val : acc),
              "",
            );

            if (longestVal !== "") {
              self.ctx.font = axis.font?.[0] ?? "Inter Tight";
              axisSize +=
                self.ctx.measureText(longestVal).width / devicePixelRatio;
            }
            const px = Math.ceil(axisSize);
            setRightAxisSize(px);
            return px;
          },
        },
      ],
      series: [
        {},
        {
          label: "Active Bank",
          stroke: "rgba(117, 77, 18, 1)",
          paths,
          points: { show: false },
          width: 2 / devicePixelRatio,
          scale: bankScaleKey,
        },
        {
          label: "Compute Units",
          stroke: computeUnitsColor,
          paths,
          points: { show: false },
          width: 2 / devicePixelRatio,
          scale: computeUnitsScaleKey,
        },
        {
          label: "Fees",
          stroke: feesColor,
          paths,
          points: { show: false },
          width: 2 / devicePixelRatio,
          scale: lamportsScaleKey,
        },
        {
          label: "Tips",
          stroke: tipsColor,
          paths,
          points: { show: false },
          width: 2 / devicePixelRatio,
          scale: lamportsScaleKey,
        },
      ],
      legend: { show: false },
      plugins: [
        cuRefAreaPlugin({
          slotTransactionsRef,
          maxComputeUnitsRef,
          bankTileCountRef,
        }),
        ...(scheduleStrategy === ScheduleStrategyEnum.revenue
          ? [revenueStartLinePlugin()]
          : []),
        timeScaleDragPlugin(),
        wheelZoomPlugin({ factor: 0.75 }),
        cuTooltipPlugin(setTooltipData),
        syncXScalePlugin(),
        cuIsFullXRangePlugin(),
        touchPlugin(),
      ],
    };
  }, [
    maxBankCount,
    maxLamports,
    scheduleStrategy,
    setTooltipData,
    isFullCuRange,
    maxComputeUnits,
    setLeftAxisSize,
    setRightAxisSize,
  ]);

  return (
    <div style={{ height: "100%" }}>
      <AutoSizer>
        {({ height, width }) => {
          options.width = width;
          options.height = height;
          return (
            <>
              <UplotReact
                id={chartId}
                options={options}
                data={chartData}
                onCreate={onCreate}
              />
            </>
          );
        }}
      </AutoSizer>
    </div>
  );
}
