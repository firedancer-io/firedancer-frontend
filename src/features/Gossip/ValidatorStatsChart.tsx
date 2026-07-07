import { useMemo } from "react";
import type { ComputedDatum } from "@nivo/pie";
import { formatNumberLamports } from "../Overview/ValidatorsCard/formatAmt";
import { sum } from "lodash";
import {
  failureColor,
  nonDelinquentChartColor,
  nonDelinquentColor,
} from "../../colors";
import PieChart, {
  type PieCenteredMetricProps,
  PieCenteredMetric,
} from "../../components/PieChart";

type ValidatorStakeData = {
  id: string;
  label: string;
  value: number;
  color: string;
  textColor: string;
};

interface ValidatorStatsChartProps {
  activeStake: bigint;
  delinquentStake: bigint;
}

export default function ValidatorStatsChart({
  activeStake,
  delinquentStake,
}: ValidatorStatsChartProps) {
  const data = useMemo(
    () => [
      {
        id: "non-delinquent",
        label: "Non-delinquent",
        value: Number(activeStake),
        color: nonDelinquentChartColor,
        textColor: nonDelinquentColor,
      },
      {
        id: "delinquent",
        label: "Delinquent",
        value: Number(delinquentStake),
        color: failureColor,
        textColor: failureColor,
      },
    ],
    [activeStake, delinquentStake],
  );

  return (
    <PieChart
      data={data}
      tooltipFormatter={formatTooltipValue}
      centeredMetric={CenteredMetric}
    />
  );
}

function formatTooltipValue(datum: ComputedDatum<ValidatorStakeData>) {
  return formatNumberLamports(BigInt(datum.value));
}

function getPct(numerator: number, denominator: number) {
  return `${denominator ? ((numerator / denominator) * 100).toFixed(2) : 0}%`;
}
function CenteredMetric({
  dataWithArc,
  centerX,
  centerY,
}: PieCenteredMetricProps<ValidatorStakeData>) {
  const total = sum(dataWithArc.map(({ value }) => value));

  const nonDelinquent = dataWithArc.find(({ id }) => id === "non-delinquent");
  const delinquent = dataWithArc.find(({ id }) => id === "delinquent");

  return (
    <PieCenteredMetric centerY={centerY}>
      {nonDelinquent && (
        <tspan
          x={centerX}
          dy="-0.3em"
          style={{ fill: nonDelinquent.data.textColor, fontSize: "18px" }}
        >
          {getPct(nonDelinquent.data.value, total)}
        </tspan>
      )}
      {delinquent && (
        <tspan
          x={centerX}
          dy="1.4em"
          style={{ fill: delinquent.data.textColor, fontSize: "14px" }}
        >
          {getPct(delinquent.data.value, total)}
        </tspan>
      )}
    </PieCenteredMetric>
  );
}
