import { useSetAtom } from "jotai";
import { useRef, useMemo, useState } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import type { SlotTransactions } from "../../../../../api/types";
import {
  chartAxisColor,
  incomePerCuToggleControlColor,
} from "../../../../../colors";
import UplotReact from "../../../../../uplotReact/UplotReact";
import { rightAxisSizeAtom } from "../../../../Overview/SlotPerformance/ComputeUnitsCard/atoms";
import {
  computeUnitsScaleKey,
  lamportsScaleKey,
} from "../../../../Overview/SlotPerformance/ComputeUnitsCard/consts";
import { lamportsPerSol } from "../../../../../consts";
import { hexToRgba } from "../../../../../colorUtils";
import {
  getPaidTxnFees,
  getPaidTxnTips,
  getTxnIncome,
} from "../../../../../utils";
import { Flex } from "@radix-ui/themes";
import ToggleGroupControl from "../../../../Overview/SlotPerformance/TransactionBarsCard/ChartControls/ToggleGroupControl";

type CuKeys = keyof Pick<
  SlotTransactions,
  "txn_compute_units_requested" | "txn_compute_units_consumed"
>;

const solTypes = ["income", "fees", "tips"];

function getChartData(
  transactions: SlotTransactions,
  key: CuKeys,
  solType: string,
) {
  return transactions[key]
    .map((cu, i) => ({ cu, i }))
    .sort((a, b) => a.cu - b.cu)
    .reduce<
      [number[], number[], (number | null)[], (number | null | undefined)[]]
    >(
      // .reduce<[number[], number[]]>(
      (acc, { cu, i }) => {
        // if (i > 1000) return acc;
        let income = Number(getTxnIncome(transactions, i));
        // if(solType === "fees") income = Number(getPaidTxnFees(transactions, i))
        // if(solType === "tips") income = Number(getPaidTxnTips(transactions, i))

        if (!income || !cu) return acc;

        acc[0].push(cu);
        acc[1].push(income);
        acc[2].push(Number(getPaidTxnFees(transactions, i)));
        acc[3].push(Number(getPaidTxnTips(transactions, i)) || null);
        return acc;
      },
      // [[], []],
      [[], [], [], []],
    );
}

interface CuIncomeScatterChartProps {
  slotTransactions: SlotTransactions;
  //   maxComputeUnits: number;
  //   bankTileCount: number;
  //   onCreate: (u: uPlot) => void;
}

export let minMax: [number, number] = [940, 2002500];

export const compactSingleDecimalFormatter = Intl.NumberFormat(undefined, {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 0,
});

export default function CuIncomeScatterChart({
  slotTransactions,
}: CuIncomeScatterChartProps) {
  const [cuKey, setCuKey] = useState<CuKeys>("txn_compute_units_consumed");
  const [solType, setSolType] = useState("income");

  // const setTooltipData = useSetAtom(cuChartTooltipDataAtom);
  // const setLeftAxisSize = useSetAtom(leftAxisSizeAtom);

  const slotTransactionsRef = useRef(slotTransactions);
  slotTransactionsRef.current = slotTransactions;
  const chartData = useMemo(
    () => getChartData(slotTransactions, cuKey, solType),
    [cuKey, slotTransactions, solType],
  );

  const options = useMemo<uPlot.Options>(() => {
    return {
      width: 0,
      height: 0,
      // drawOrder: ["axes", "series"] as uPlot.DrawOrderKey[],
      // cursor: {
      //   points: { show: true, one: true, fill: "green" },
      // },
      scales: {
        [computeUnitsScaleKey]: {
          time: false,
          auto: true,
          // log: 2,
          // range: [0, 48000000],
          distr: 3,
        },
        [lamportsScaleKey]: {
          time: false,

          // auto: true,
          // range: [0],
          // range: (u, initMin, initMax) => {
          //   return [0, initMax];
          // },
          // log: 2,
          range: (u, min, max) => {
            minMax = [min, max];
            return [min, max];
          },
          // min: 1,
          // max: 2002500,
          distr: 3,
        },
      },

      axes: [
        {
          scale: computeUnitsScaleKey,
          border: {
            show: true,
            width: 1 / devicePixelRatio,
            stroke: chartAxisColor,
          },
          stroke: chartAxisColor,
          // grid: {
          //   width: 1 / devicePixelRatio,
          //   stroke: chartGridColor,
          // },
          // ticks: {
          //   width: 1 / devicePixelRatio,
          //   stroke: chartAxisColor,
          //   size: 5,
          // },
          // font: "Inter tight",
          // space: 10,
          // size: 30,
          values: (self, ticks) => {
            return ticks.map((rawValue) =>
              rawValue
                ? compactSingleDecimalFormatter.format(rawValue)
                : rawValue,
            );
          },
          // values: (self, ticks) => {
          //   return ticks.map((rawValue) => rawValue / 1_000_000 + "ms");
          // },
          // space: 100,
        },
        {
          scale: lamportsScaleKey,
          stroke: chartAxisColor,
          border: {
            show: true,
            width: 1 / devicePixelRatio,
            stroke: chartAxisColor,
          },
          // ticks: {
          //   width: 1 / devicePixelRatio,
          //   stroke: chartAxisColor,
          //   size: 5,
          // },
          values: (self, ticks) => [],
          // ticks.map((rawValue) =>
          //   rawValue ? rawValue / lamportsPerSol + " SOL" : "",
          // ),
          // show: false,
          // side: 1,
          // space: 35,
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
            return px;
          },
        },
      ],
      series: [
        {
          scale: computeUnitsScaleKey,
        },
        // {
        //   scale: lamportsScaleKey,
        //   label: "a",
        //   stroke: undefined,
        //   points: {
        //     show: false,
        //     size: 10,
        //     width: 0,
        //     fill: hexToRgba(tipsColor, 0.2),
        //     space: 1,
        //   },
        //   // Disable line; show only points
        //   //   stroke: undefined,
        //   //   points: {
        //   //     show: true,
        //   //     size: 100, // point radius in px
        //   //     width: 199, // outline width (0 = no outline)
        //   //     fill: "blue",
        //   //   },
        // },
        // {
        //   scale: lamportsScaleKey,
        //   label: "b",
        //   stroke: undefined,
        //   points: {
        //     show: false,
        //     size: 10,
        //     width: 0,
        //     fill: hexToRgba(feesColor, 0.2),
        //     space: 1,
        //   },
        //   // Disable line; show only points
        //   //   stroke: undefined,
        //   //   points: {
        //   //     show: true,
        //   //     size: 100, // point radius in px
        //   //     width: 199, // outline width (0 = no outline)
        //   //     fill: "blue",
        //   //   },
        // },
        {
          scale: lamportsScaleKey,
          stroke: undefined,
          points: {
            show: solType === "income",
            size: 5,
            // width: 0,
            fill: hexToRgba(incomePerCuToggleControlColor, 0.3),
            space: 0,
          },
        },
        {
          scale: lamportsScaleKey,
          stroke: undefined,
          points: {
            show: solType === "fees",
            size: 5,
            // width: 0,
            fill: hexToRgba(incomePerCuToggleControlColor, 0.3),
            space: 0,
          },
        },
        {
          scale: lamportsScaleKey,
          stroke: undefined,
          points: {
            show: solType === "tips",
            size: 5,
            // width: 0,
            fill: hexToRgba(incomePerCuToggleControlColor, 0.3),
            space: 0,
          },
        },
      ],
      legend: { show: false },
    };
  }, [solType]);

  return (
    <Flex direction="column" style={{ height: "100%" }} gap="1" flexGrow="1">
      {/* <ToggleGroupControl
        options={cuOptions}
        onChange={(value) => setCuKey(value)}
        defaultValue={cuKey}
        label="CU"
      /> */}
      {/* <ToggleGroupControl
        options={solTypes}
        onChange={(value) => setSolType(value)}
        defaultValue="income"
        label="SOL"
      /> */}
      <div style={{ flex: 1 }}>
        <AutoSizer>
          {({ height, width }) => {
            options.width = width;
            options.height = height;
            return (
              <>
                <UplotReact id="cuIncome" options={options} data={chartData} />
              </>
            );
          }}
        </AutoSizer>
      </div>
    </Flex>
  );
}
