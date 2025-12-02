import { useAtomValue } from "jotai";
import { useSlotQueryResponseTransactions } from "../../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../../../../Overview/SlotPerformance/atoms";
import { Flex } from "@radix-ui/themes";
import { SlotDetailsSubSection } from "../../SlotDetailsSubSection.tsx";
import type { SlotTransactions } from "../../../../../api/types.ts";
import { getTxnIncome } from "../../../../../utils.ts";
import { useMemo } from "react";
import IncomeScatterChart from "./IncomeScatterChart.tsx";
import type uPlot from "uplot";
import { subsectionGapX } from "../../consts.ts";

function getCuChartData(transactions?: SlotTransactions | null) {
  return transactions?.txn_compute_units_consumed
    .map((cu, i) => ({ cu, i }))
    .sort((a, b) => a.cu - b.cu)
    .reduce<[number[], number[]]>(
      (acc, { cu, i }) => {
        const income = Number(getTxnIncome(transactions, i));

        if (!income || !cu) return acc;

        acc[0].push(cu);
        acc[1].push(income);
        return acc;
      },
      [[], []],
    ) satisfies uPlot.AlignedData | undefined;
}

/** Scales ranges from [negMin, posMax] to [0, 1] */
function xToScaled(x: number, negMin: number, posMax: number) {
  if (x <= 0) {
    return (0.5 * (x - negMin)) / -negMin;
  } else {
    return 0.5 + 0.5 * (x / posMax);
  }
}

/** Gets original value from scaled range from [0, 1] to [negMin, posMax] */
function scaledToX(scaled: number, negMin: number, posMax: number) {
  if (scaled <= 0.5) {
    return negMin + (scaled / 0.5) * -negMin;
  } else {
    return ((scaled - 0.5) / 0.5) * posMax;
  }
}

function getArrivalChartData(transactions?: SlotTransactions | null) {
  if (!transactions) return;

  const chartData = transactions.txn_arrival_timestamps_nanos
    .map((tsNanos, i) => ({ tsNanos, i }))
    .sort((a, b) => Number(a.tsNanos - b.tsNanos))
    .reduce<[number[], number[]]>(
      (acc, { tsNanos, i }) => {
        const tsMs =
          Number(tsNanos - transactions.start_timestamp_nanos) / 1_000_000;
        const income = Number(getTxnIncome(transactions, i));
        if (!income) return acc;

        acc[0].push(tsMs);
        acc[1].push(income ?? 0);

        return acc;
      },
      [[], []],
    ) satisfies uPlot.AlignedData;
  const min = chartData[0][0];
  const max = chartData[0][chartData[0].length - 1];

  chartData[0] = chartData[0].map((x) => xToScaled(x, min, max));

  return { min, max, chartData };
}

export default function IncomeScatterCharts() {
  const slot = useAtomValue(selectedSlotAtom);
  const transactions =
    useSlotQueryResponseTransactions(slot).response?.transactions;
  const query = useSlotQueryResponseTransactions(slot);

  const cuChartData = useMemo(
    () => getCuChartData(transactions),
    [transactions],
  );

  const arrivalChartData = useMemo(
    () => getArrivalChartData(transactions),
    [transactions],
  );

  const arrivalXScaleOptions = useMemo(() => {
    if (!arrivalChartData) return;
    return {
      scaledToX,
      negMin: arrivalChartData.min,
      posMax: arrivalChartData.max,
    };
  }, [arrivalChartData]);

  if (!query.response?.transactions || !cuChartData || !arrivalChartData)
    return;

  return (
    <Flex flexGrow="1" minWidth="300px" minHeight="150px" gap={subsectionGapX}>
      <SlotDetailsSubSection title="Compute Units vs Income" flexGrow="1">
        <IncomeScatterChart
          id="cuIncomeScatterChart"
          data={cuChartData}
          xLogScale
        />
      </SlotDetailsSubSection>
      <SlotDetailsSubSection title="Arrival Time vs Income" flexGrow="1">
        <IncomeScatterChart
          id="arrivalIncomeScatterChart"
          data={arrivalChartData.chartData}
          xScaleOptions={arrivalXScaleOptions}
        />
      </SlotDetailsSubSection>
    </Flex>
  );
}
