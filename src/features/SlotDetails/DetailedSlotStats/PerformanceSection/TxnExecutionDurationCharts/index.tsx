import { Box, Flex } from "@radix-ui/themes";
import { useMemo } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import uPlot, { type AlignedData, type Options } from "uplot";
import UplotReact from "../../../../../uplotReact/UplotReact";
import { useAtomValue } from "jotai";
import { selectedSlotAtom } from "../../../../Overview/SlotPerformance/atoms";
import { useSlotQueryResponseTransactions } from "../../../../../hooks/useSlotQuery";
import type { SlotTransactions } from "../../../../../api/types";
import { getMax, isDefined } from "../../../../../utils";
import { getDurationWithUnits } from "../../../../Overview/SlotPerformance/TransactionBarsCard/chartUtils";
import { SlotDetailsSubSection } from "../../SlotDetailsSubSection";

export default function TxnExecutionDurationCharts() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const transactions =
    useSlotQueryResponseTransactions(selectedSlot).response?.transactions;

  if (!transactions) return;

  return (
    <Flex direction="column" flexGrow="1">
      <SlotDetailsSubSection title="Count vs Txn Duration" flexGrow="1">
        <CountChart transactions={transactions} />
      </SlotDetailsSubSection>
      <SlotDetailsSubSection title="Cus vs Txn Duration" flexGrow="1">
        <CuChart transactions={transactions} />
      </SlotDetailsSubSection>
    </Flex>
  );
}

const bucketCount = 20;

let _max = 0;
const xValues = (_u: uPlot, splits: number[], axisIdx: number) => {
  return splits.map((bucket, i) => {
    const rawDuration = (bucket / bucketCount) * _max;
    const durationUnits = getDurationWithUnits(rawDuration);
    return `${durationUnits.value} ${durationUnits.unit}`;
  });
};

const barsPaths =
  uPlot.paths?.bars?.({ size: [0.8] }) ??
  (() => ({ stroke: new Path2D(), fill: new Path2D() })); // fallback no-op

interface ChartProps {
  id: string;
  data: AlignedData;
  log?: boolean;
}

function Chart({ data, log, id }: ChartProps) {
  const options = useMemo<Options>(() => {
    return {
      width: 0,
      height: 0,
      scales: { duration: { time: false }, y: { auto: true } },
      series: [
        { scale: "duration" },
        {
          label: "Count",
          points: { show: false },
          fill: "#3C2E69",
          paths: barsPaths,
        },
      ],
      axes: [
        {
          scale: "duration",
          splits: [0, data[0].length],
          values: xValues,
          label: "Txn Execution Duration",
          stroke: "gray",
          grid: { show: false },
        },
        {
          stroke: "gray",
          values: (u, splits) => {
            return log ? splits.map((v) => Math.trunc(Math.exp(v))) : splits;
          },
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
              (acc, val) => (`${val}`.length > acc.length ? `${val}` : acc),
              "",
            );
            if (longestVal !== "") {
              self.ctx.font = axis.font?.[0] ?? "Inter Tight";
              axisSize +=
                self.ctx.measureText(longestVal).width / devicePixelRatio;
            }
            const px = Math.ceil(axisSize);
            return px;
          },
        },
      ],
      legend: { show: false },
    };
  }, [data, log]);

  return (
    <Box flexGrow="1">
      <AutoSizer>
        {({ height, width }) => {
          options.width = width;
          options.height = height;
          return <UplotReact id={id} options={options} data={data} />;
        }}
      </AutoSizer>
    </Box>
  );
}

interface ChartContainerProps {
  transactions: SlotTransactions;
}

function CountChart({ transactions }: ChartContainerProps) {
  //   TODO fix for bundles
  const data = useMemo<AlignedData>(() => {
    const txnDurations = transactions.txn_landed
      .map((isLanded, i) => {
        return Number(
          transactions.txn_mb_end_timestamps_nanos[i] -
            transactions.txn_mb_start_timestamps_nanos[i],
        );
      })
      .filter((d) => d);

    const max = getMax(txnDurations) + 1;
    _max = max;

    let buckets = new Array<number>(bucketCount).fill(0);
    for (const txnDuration of txnDurations) {
      const idx = Math.trunc((txnDuration / max) * bucketCount);
      buckets[idx]++;
    }

    buckets = buckets.map((v) => Math.log(v + 1));

    return [buckets.map((_, i) => i), buckets];
  }, [transactions]);

  return <Chart data={data} id="txnExecutionDurationCount" log />;
}

function CuChart({ transactions }: ChartContainerProps) {
  const data = useMemo<AlignedData>(() => {
    const txnDurations = transactions.txn_landed
      .map((isLanded, i) => {
        return {
          duration: Number(
            transactions.txn_mb_end_timestamps_nanos[i] -
              transactions.txn_mb_start_timestamps_nanos[i],
          ),
          cu: transactions.txn_compute_units_consumed[i],
        };
      })
      .filter(isDefined);

    const max = getMax(txnDurations.map(({ duration }) => duration)) + 1;
    _max = max;

    const bucketsWithCount = new Array(bucketCount).fill(0).map((b) => ({
      count: 0,
      cus: 0,
    }));
    for (const { duration, cu } of txnDurations) {
      const idx = Math.trunc((duration / max) * bucketCount);
      bucketsWithCount[idx].count++;
      bucketsWithCount[idx].cus += cu;
    }

    const buckets = bucketsWithCount.map(({ count, cus }) =>
      count ? cus / count : 0,
    );
    return [buckets.map((_, i) => i), buckets];
  }, [transactions]);

  return <Chart data={data} id="txnExecutionDurationCu" />;
}
