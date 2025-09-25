import { Flex, Switch, Text } from "@radix-ui/themes";
import { useMemo, useState } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import uPlot, { type AlignedData, type Options } from "uplot";
import UplotReact from "../../../../../uplotReact/UplotReact";
import { useAtomValue } from "jotai";
import { selectedSlotAtom } from "../../../../Overview/SlotPerformance/atoms";
import { useSlotQueryResponseTransactions } from "../../../../../hooks/useSlotQuery";
import type { SlotTransactions } from "../../../../../api/types";
import { getDurationValues, isDefined } from "../../../../../utils";
import ToggleGroupControl from "../../../../Overview/SlotPerformance/TransactionBarsCard/ChartControls/ToggleGroupControl";
import { getDurationWithUnits } from "../../../../Overview/SlotPerformance/TransactionBarsCard/chartUtils";

type ScaleOption = "sqrt" | "log" | "all";
const options = ["sqrt", "log", "all"];
export default function TxnExecutionDurationCharts() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const transactions =
    useSlotQueryResponseTransactions(selectedSlot).response?.transactions;
  const [landed, setLanded] = useState(true);
  const [scale, setScale] = useState<ScaleOption>("log");

  if (!transactions) return;

  return (
    <Flex direction="column" flexGrow="1">
      <Text style={{ color: "var(--gray-12)" }}>
        Count vs Txn Execution Duration
      </Text>
      {/* <Text style={{ color: "var(--gray-10)" }}>Filters?</Text>
      <Flex gap="2">
        <Text style={{ color: "var(--gray-10)" }}>Landed</Text>
        <Switch checked={landed} onCheckedChange={setLanded} />
        <ToggleGroupControl
          options={options}
          onChange={(value) => setScale(value as "sqrt" | "log")}
          defaultValue={scale}
          label="Scale"
        />
      </Flex> */}
      {/* <Flex gap="2"> */}
      <Chart transactions={transactions} landed={landed} scale={scale} />
      {/* </Flex> */}
    </Flex>
  );
}

// bucketed data setup omitted for brevity; assume these exist:
const xIdx: number[] = [0, 1, 2];
const labels: string[] = ["0–5ms", "5–10ms"];
const counts: number[] = [12, 8, 3];

const bucketCount = 20;

let _max = 0;
const xSplits = () => xIdx;
const xValues = (_u: uPlot, splits: number[], axisIdx: number) => {
  return splits.map((bucket, i) => {
    const rawDuration = (bucket / bucketCount) * _max;
    const durationUnits = getDurationWithUnits(rawDuration);
    return `${durationUnits.value} ${durationUnits.unit}`;
  });
};

// Access bars helper (often lives under uPlot.paths). If your build doesn't expose it,
// you can add a module augmentation or keep the any-cast below.
const barsPaths =
  uPlot.paths?.bars?.({ size: [0.8] }) ??
  (() => ({ stroke: new Path2D(), fill: new Path2D() })); // fallback no-op

interface ChartProps {
  transactions: SlotTransactions;
  landed: boolean;
  scale: ScaleOption;
}

function Chart({ transactions, landed }: ChartProps) {
  //   TODO fix for bundles
  const countData = useMemo<AlignedData>(() => {
    let txnDurations = transactions.txn_landed
      .map((isLanded, i) => {
        if (landed && !isLanded) return 0;
        return Number(
          transactions.txn_mb_end_timestamps_nanos[i] -
            transactions.txn_mb_start_timestamps_nanos[i],
        );
      })
      .filter((d) => d);
    // const min = Math.min(...txnDurations);
    // txnDurations = txnDurations.map((duration) => duration - min);

    const max = Math.max(...txnDurations) + 1;
    _max = max;

    let buckets = new Array<number>(bucketCount).fill(0);
    for (const txnDuration of txnDurations) {
      const idx = Math.trunc((txnDuration / max) * bucketCount);
      buckets[idx]++;
    }

    // if (scale === "sqrt") {
    // buckets = buckets.map((v) => Math.sqrt(v));
    // }
    // if (scale === "log") {
    buckets = buckets.map((v) => Math.log(v + 1));
    // }

    return [buckets.map((_, i) => i), buckets];
  }, [landed, transactions]);

  const cuData = useMemo<AlignedData>(() => {
    // let cus = transactions.txn_landed
    //   .map((isLanded, i) => {
    //     if (landed && !isLanded) return 0;
    //     return transactions.txn_compute_units_consumed[i];
    //   })
    //   .filter((d) => d);
    let txnDurations = transactions.txn_landed
      .map((isLanded, i) => {
        if (landed && !isLanded) return;
        return {
          duration: Number(
            transactions.txn_mb_end_timestamps_nanos[i] -
              transactions.txn_mb_start_timestamps_nanos[i],
          ),
          cu: transactions.txn_compute_units_consumed[i],
        };
      })
      .filter(isDefined);

    const max = Math.max(...txnDurations.map(({ duration }) => duration)) + 1;
    _max = max;

    let bucketsWithCount = new Array(bucketCount).fill(0).map((b) => ({
      count: 0,
      cus: 0,
    }));
    for (const { duration, cu } of txnDurations) {
      const idx = Math.trunc((duration / max) * bucketCount);
      bucketsWithCount[idx].count++;
      bucketsWithCount[idx].cus += cu;
    }

    let buckets = bucketsWithCount.map(({ count, cus }) =>
      count ? cus / count : 0,
    );

    // if (scale === "sqrt") {
    //   buckets = buckets.map((v) => Math.sqrt(v));
    // }
    // if (scale === "log") {
    //   buckets = buckets.map((v) => Math.log(v + 1));
    // }
    return [buckets.map((_, i) => i), buckets];
  }, [landed, transactions]);

  const options = useMemo<Options>(() => {
    return {
      width: 0,
      height: 0,
      //   title: "Durations (bucketed) vs Count",
      scales: { duration: { time: false }, y: { auto: true } },
      series: [
        { scale: "duration" }, // x series
        {
          label: "Count",
          points: { show: false },
          //   stroke: "rgba(52, 152, 219, 1)",
          //   strok
          fill: "#3C2E69",
          // Use built-in bars helper
          paths: barsPaths,
        },
      ],
      axes: [
        {
          scale: "duration",
          splits: [0, countData[0].length],
          values: xValues,
          label: "Txn Execution Duration",
          stroke: "gray",
          grid: { show: false },
          //   size: 70,
        },
        {
          // label: "Count",
          stroke: "gray",
          values: (u, splits) => {
            // if (scale === "sqrt") {
            // return splits.map((v) => v * v);
            // }
            // if (scale === "log") {
            return splits.map((v) => Math.trunc(Math.exp(v)));
            // }
            // return splits;
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
            // const expValues = values?.map((v) => Math.trunc(Math.exp(+v)).toString());
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
            // setLeftAxisSize(px);
            return px;
          },
        },
      ],
      legend: { show: false },
    };
  }, [countData]);

  const cuOptions = useMemo<Options>(() => {
    return {
      width: 0,
      height: 0,
      //   title: "Durations (bucketed) vs Count",
      scales: { duration: { time: false }, y: { auto: true } },
      series: [
        { scale: "duration" }, // x series
        {
          label: "Count",
          points: { show: false },
          //   stroke: "rgba(52, 152, 219, 1)",
          //   strok
          fill: "#3C2E69",
          // Use built-in bars helper
          paths: barsPaths,
        },
      ],
      axes: [
        {
          scale: "duration",
          splits: [0, cuData[0].length],
          values: xValues,
          label: "Txn Execution Duration",
          stroke: "gray",
          grid: { show: false },
          //   size: 70,
        },
        {
          // label: "Count",
          stroke: "gray",
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
            // setLeftAxisSize(px);
            return px;
          },
        },
      ],
      legend: { show: false },
    };
  }, [cuData]);

  return (
    <>
      <div style={{ flex: 1, paddingRight: "4px" }}>
        <AutoSizer>
          {({ height, width }) => {
            options.width = width;
            options.height = height;
            return (
              <>
                <UplotReact
                  id="txnExecutionDurationCount"
                  options={options}
                  data={countData}
                />
              </>
            );
          }}
        </AutoSizer>
      </div>
      <Text style={{ color: "var(--gray-12)" }}>
        CUs vs Txn Execution Duration
      </Text>
      <div style={{ flex: 1, paddingRight: "4px" }}>
        <AutoSizer>
          {({ height, width }) => {
            cuOptions.width = width;
            cuOptions.height = height;

            return (
              <>
                <UplotReact
                  id="txnExecutionDurationCus"
                  options={cuOptions}
                  data={cuData}
                />
              </>
            );
          }}
        </AutoSizer>
      </div>
    </>
  );
}
