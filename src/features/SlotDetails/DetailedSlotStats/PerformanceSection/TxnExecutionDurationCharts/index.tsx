import { Box } from "@radix-ui/themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import uPlot, { type AlignedData, type Options } from "uplot";
import UplotReact from "../../../../../uplotReact/UplotReact";
import { useAtomValue } from "jotai";
import { selectedSlotAtom } from "../../../../Overview/SlotPerformance/atoms";
import { useSlotQueryResponseTransactions } from "../../../../../hooks/useSlotQuery";
import { getMax } from "../../../../../utils";
import { getDurationWithUnits } from "../../../../Overview/SlotPerformance/TransactionBarsCard/chartUtils";
import { SlotDetailsSubSection } from "../../SlotDetailsSubSection";
import { chartAxisColor } from "../../../../../colors";
import { uplotChartsAtom } from "../../../../../uplotReact/uplotAtoms";
import { txnExecutionDurationTooltipPlugin } from "./txnExecutionDurationTooltipPlugin";
import { syncXScalePlugin } from "../../../../../uplotReact/syncXScalePlugin";
import TxnExecutionDurationChartTooltip from "./TxnExecutionDurationChartTooltip";
import type { MutableRefObject } from "react";
import { txnExecutionDurationScaleKey } from "../../../../Overview/SlotPerformance/ComputeUnitsCard/consts";

const bucketCount = 20;
const bucketIndices = Array.from({ length: bucketCount }, (_, i) => i);

const getBucketIndex = (duration: number, maxDuration: number) =>
  Math.trunc((duration / maxDuration) * bucketCount);

const getBucketDuration = (idx: number, maxDuration: number) =>
  (idx / bucketCount) * maxDuration;

const cuChartId = "txnExecutionDurationCu";
const countChartId = "txnExecutionDurationCount";
const axisFont = "8px Inter Tight";
const barFillColor = "#3C2E69";
const ySeriesIdx = 1;

const barsPaths =
  uPlot.paths?.bars?.({ size: [0.8] }) ??
  (() => ({ stroke: new Path2D(), fill: new Path2D() })); // fallback no-op

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
const getAxisSize = (axis: uPlot.Axis): number => (axis as any)._size ?? 0;

interface TxnExecutionDurationChartData {
  cuData: AlignedData;
  countData: AlignedData;
  maxDuration: number;
}

const defaultTxnExecutionDurationChartData: TxnExecutionDurationChartData = {
  cuData: [[], []],
  countData: [[], []],
  maxDuration: 0,
};

const fmtDuration = (nanos: number, maximumFractionDigits?: number) => {
  const { value, unit } = getDurationWithUnits(
    nanos,
    false,
    maximumFractionDigits,
  );
  return `${value} ${unit}`;
};

export default function TxnExecutionDurationCharts() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const transactions =
    useSlotQueryResponseTransactions(selectedSlot).response?.transactions;
  const uplotCharts = useAtomValue(uplotChartsAtom);
  const [tooltipDataIdx, setTooltipDataIdx] = useState<number | undefined>();
  const minYAxisSizeRef = useRef(0);

  useEffect(() => {
    const cu = uplotCharts[cuChartId];
    const count = uplotCharts[countChartId];
    if (!cu || !count) return;

    /* Align the charts by syncing their y axis sizes.
     * Reset the charts to their natural sizes, then sync
     * minYAxisSizeRef to the larger of the two and redraw */
    minYAxisSizeRef.current = 0;
    cu.redraw(false, true);
    count.redraw(false, true);

    const cuSize: number = getAxisSize(cu.axes[ySeriesIdx]);
    const countSize: number = getAxisSize(count.axes[ySeriesIdx]);
    minYAxisSizeRef.current = Math.max(cuSize, countSize);

    cu.redraw(false, true);
    count.redraw(false, true);
  }, [transactions, uplotCharts]);

  const { cuData, countData, maxDuration }: TxnExecutionDurationChartData =
    useMemo(() => {
      if (!transactions) return defaultTxnExecutionDurationChartData;

      const items = transactions.txn_landed
        .map((_, i) => ({
          duration: Number(
            transactions.txn_mb_end_timestamps_nanos[i] -
              transactions.txn_mb_start_timestamps_nanos[i],
          ),
          cu: transactions.txn_compute_units_consumed[i],
        }))
        .filter(({ duration }) => duration > 0);

      if (items.length === 0) return defaultTxnExecutionDurationChartData;

      const maxDuration = getMax(items.map(({ duration }) => duration)) + 1;

      const buckets = Array.from({ length: bucketCount }, () => ({
        count: 0,
        cus: 0,
      }));

      for (const { duration, cu } of items) {
        const idx = getBucketIndex(duration, maxDuration);
        buckets[idx].count++;
        buckets[idx].cus += cu;
      }

      const bucketedCounts = buckets.map(({ count }) => count);
      const bucketedCUs = buckets.map(({ count, cus }) =>
        count ? cus / count : 0,
      );

      return {
        countData: [bucketIndices, bucketedCounts],
        cuData: [bucketIndices, bucketedCUs],
        maxDuration,
      };
    }, [transactions]);

  const formatBucketRange = useCallback(
    (idx: number) =>
      `${fmtDuration(getBucketDuration(idx, maxDuration), 2)} - ${fmtDuration(getBucketDuration(idx + 1, maxDuration), 2)}`,
    [maxDuration],
  );

  const tooltipData = useMemo(
    () =>
      tooltipDataIdx !== undefined
        ? {
            bucketIdx: tooltipDataIdx,
            cuYVal: cuData[ySeriesIdx][tooltipDataIdx],
            countYVal: countData[ySeriesIdx][tooltipDataIdx],
          }
        : undefined,
    [countData, cuData, tooltipDataIdx],
  );

  if (!transactions) return;

  return (
    <>
      <SlotDetailsSubSection
        title="CUs vs Txn Execution Duration"
        minWidth="200px"
        minHeight="100px"
        flexGrow="1"
      >
        <Chart
          data={cuData}
          id={cuChartId}
          maxDuration={maxDuration}
          minYAxisSizeRef={minYAxisSizeRef}
          setTooltipDataIdx={setTooltipDataIdx}
        />
      </SlotDetailsSubSection>
      <SlotDetailsSubSection
        title="Transaction Count vs Txn Execution Duration"
        minWidth="200px"
        minHeight="100px"
        flexGrow="1"
      >
        <Chart
          data={countData}
          id={countChartId}
          log
          maxDuration={maxDuration}
          minYAxisSizeRef={minYAxisSizeRef}
          setTooltipDataIdx={setTooltipDataIdx}
        />
      </SlotDetailsSubSection>
      <TxnExecutionDurationChartTooltip
        data={tooltipData}
        formatBucketRange={formatBucketRange}
      />
    </>
  );
}

interface ChartProps {
  id: string;
  data: AlignedData;
  log?: boolean;
  maxDuration: number;
  minYAxisSizeRef: MutableRefObject<number>;
  setTooltipDataIdx: (idx: number) => void;
}

function Chart({
  data,
  log,
  id,
  maxDuration,
  minYAxisSizeRef,
  setTooltipDataIdx,
}: ChartProps) {
  const plotData = useMemo<AlignedData>(
    () =>
      log
        ? [
            data[0],
            (data[ySeriesIdx] as number[]).map((v) => Math.log((v ?? 0) + 1)),
          ]
        : data,
    [data, log],
  );

  const lastXIdx = Math.max(0, data[0].length - 1);

  const options = useMemo<Options>(() => {
    return {
      width: 0,
      height: 0,
      cursor: { sync: { key: txnExecutionDurationScaleKey } },
      scales: {
        duration: { time: false },
        y: {
          auto: true,
          /* When zoomed into empty buckets, the range can be an unreasonably
           * large value on the log scale or go negative on the linear scale.
           * Clamp the range to the data's max value or a reasonable number.
           * The axis splits will be [0, 1, 2] with no data. */
          range: (_u: uPlot, _min: number, dataMax: number) =>
            log
              ? [0, Math.max(dataMax, Math.log(3))]
              : [0, Math.max(dataMax, 2)],
        },
      },
      series: [
        { scale: "duration" },
        {
          label: "Count",
          points: { show: false },
          fill: barFillColor,
          paths: barsPaths,
        },
      ],
      axes: [
        {
          scale: "duration",
          splits: [0, lastXIdx],
          values: (_u, splits) =>
            splits.map((bucket) =>
              fmtDuration(getBucketDuration(bucket, maxDuration)),
            ),
          label: "Txn Execution Duration",
          stroke: chartAxisColor,
          grid: { show: false },
          size: 10,
          gap: 0,
          font: axisFont,
          labelFont: axisFont,
          labelGap: 0,
          labelSize: 10,
        },
        {
          stroke: chartAxisColor,
          /* Show min, midpoint, and max (especially important on
           * log scale charts where intermediate gridlines do not
           * have evenly spaced values. */
          splits: (_u, _axisIdx, scaleMin, scaleMax) => [
            scaleMin,
            (scaleMin + scaleMax) / 2,
            scaleMax,
          ],
          values: (_u, splits) => {
            const raw = log
              ? splits.map((v) => Math.round(Math.exp(v) - 1))
              : splits.map(Math.round);
            return raw.map((v) => v.toLocaleString());
          },
          gap: 0,
          font: axisFont,
          size(self, values, axisIdx, cycleNum) {
            const axis = self.axes[axisIdx];
            // bail out, force convergence
            if (cycleNum > 1) return getAxisSize(axis);

            const axisSpacing = (axis.ticks?.size ?? 0) + (axis.gap ?? 0);

            // Find the longest value and size the axis to it
            const longestVal = (values ?? []).reduce(
              (acc, val) => (val.length > acc.length ? val : acc),
              "",
            );

            if (longestVal === "") return Math.ceil(axisSpacing);

            self.ctx.font = axis.font?.[0] ?? axisFont;
            const axisValuesSize =
              self.ctx.measureText(longestVal).width / devicePixelRatio;

            return Math.max(
              Math.ceil(axisSpacing + axisValuesSize),
              minYAxisSizeRef.current,
            );
          },
        },
      ],
      legend: { show: false },
      plugins: [
        txnExecutionDurationTooltipPlugin(setTooltipDataIdx),
        syncXScalePlugin({ minRange: 0 }),
      ],
    };
  }, [lastXIdx, setTooltipDataIdx, maxDuration, log, minYAxisSizeRef]);

  return (
    <Box flexGrow="1">
      <AutoSizer>
        {({ height, width }) => {
          options.width = width;
          options.height = height;
          return <UplotReact id={id} options={options} data={plotData} />;
        }}
      </AutoSizer>
    </Box>
  );
}
