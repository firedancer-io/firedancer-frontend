import { useRef, useMemo } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import type { SlotTransactions } from "../../../../../api/types";
import {
  chartAxisColor,
  incomePerCuToggleControlColor,
} from "../../../../../colors";
import UplotReact from "../../../../../uplotReact/UplotReact";
import { lamportsScaleKey } from "../../../../Overview/SlotPerformance/ComputeUnitsCard/consts";
import { hexToRgba } from "../../../../../colorUtils";
import { getTxnIncome } from "../../../../../utils";
import { Flex } from "@radix-ui/themes";
import { minMax } from "./CuIncomeScatterChart";

function xToScaled(x: number, negMin: number, posMax: number) {
  if (x <= 0) {
    return (0.5 * (x - negMin)) / -negMin;
  } else {
    return 0.5 + 0.5 * (x / posMax);
  }
}

function scaledToX(scaled: number, negMin: number, posMax: number) {
  if (scaled <= 0.5) {
    return negMin + (scaled / 0.5) * -negMin;
  } else {
    return ((scaled - 0.5) / 0.5) * posMax;
  }
}

// optional: "nice" originals to label on each side
function niceLinearTicks(min: number, max: number, count: number) {
  const span = max - min;
  const step = span / Math.max(1, count);
  const res: number[] = [];
  for (let i = 0; i <= count; i++) res.push(min + i * step);
  return res;
}

// build display-space tick positions
function buildPiecewiseTicks(negMin: number, posCap: number) {
  const negTicksOrig = niceLinearTicks(negMin, 0, 4); // 4 ticks on left
  const posTicksOrig = niceLinearTicks(0, posCap, 4); // 4 ticks on right
  const allOrig = [...negTicksOrig, 0, ...posTicksOrig];
  const displayTicks = allOrig.map((v) => xToScaled(v, negMin, posCap));
  return Array.from(new Set(displayTicks)).sort((a, b) => a - b);
}

function getChartData(transactions: SlotTransactions) {
  const chartData = transactions.txn_arrival_timestamps_nanos
    .toSorted((a, b) => Number(a - b))
    .reduce<[number[], number[]]>(
      (acc, arrivalTsNanos, i) => {
        const arrivalTs =
          Number(arrivalTsNanos - transactions.start_timestamp_nanos) /
          1_000_000;
        const income = Number(getTxnIncome(transactions, i));
        if (!income) return acc;

        acc[0].push(arrivalTs);
        acc[1].push(income);

        return acc;
      },
      [[], []],
    );
  const min = chartData[0][0];
  const max = chartData[0][chartData[0].length - 1];

  chartData[0] = chartData[0].map((x) => xToScaled(x, min, max));

  return { min, max, chartData };
}

const arrivalScaleKey = "arrivalTs";

interface CuIncomeScatterChartProps {
  slotTransactions: SlotTransactions;
}

export default function ArrivalIncomeScatterChart({
  slotTransactions,
}: CuIncomeScatterChartProps) {
  const slotTransactionsRef = useRef(slotTransactions);
  slotTransactionsRef.current = slotTransactions;
  const { min, max, chartData } = useMemo(
    () => getChartData(slotTransactions),
    [slotTransactions],
  );

  const options = useMemo<uPlot.Options>(() => {
    return {
      width: 0,
      height: 0,
      scales: {
        [arrivalScaleKey]: {
          time: false,
          auto: true,
          // distr: 3,
        },
        [lamportsScaleKey]: {
          time: false,
          // auto: true,

          range: (u, min, max) => {
            return minMax;
            // return [940, 2002500];
          },
          distr: 3,
        },
      },

      axes: [
        {
          scale: arrivalScaleKey,
          border: {
            show: true,
            width: 1 / devicePixelRatio,
            stroke: chartAxisColor,
          },
          stroke: chartAxisColor,
          values: (u, ticks) =>
            ticks.map((t) => {
              const v = scaledToX(t, min, max);
              // format original values, include a “>400” label if you add a tick at t=1:
              return Math.round(v).toLocaleString();
            }),
        },
        {
          scale: lamportsScaleKey,
          stroke: chartAxisColor,
          border: {
            show: true,
            width: 1 / devicePixelRatio,
            stroke: chartAxisColor,
          },

          values: (self, ticks) => [],
          // ticks.map((rawValue) =>
          //   rawValue ? rawValue / lamportsPerSol + " SOL" : "",
          // ),
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
            return px + 10;
          },
        },
      ],
      series: [
        {
          scale: arrivalScaleKey,
        },
        {
          scale: lamportsScaleKey,
          stroke: undefined,
          points: {
            size: 5,
            // width: 0,
            fill: hexToRgba(incomePerCuToggleControlColor, 0.3),
            space: 0,
          },
        },
      ],
      legend: { show: false },
    };
  }, [max, min]);

  return (
    <Flex direction="column" style={{ height: "100%" }} gap="1" flexGrow="1">
      <div style={{ flex: 1 }}>
        <AutoSizer>
          {({ height, width }) => {
            options.width = width;
            options.height = height;
            return (
              <>
                <UplotReact
                  id="arrivalIncome"
                  options={options}
                  data={chartData}
                />
              </>
            );
          }}
        </AutoSizer>
      </div>
    </Flex>
  );
}
