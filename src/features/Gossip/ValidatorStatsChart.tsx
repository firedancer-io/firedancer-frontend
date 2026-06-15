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

function CenteredMetric({
  dataWithArc,
  centerX,
  centerY,
}: PieCenteredMetricProps<ValidatorStakeData>) {
  const total = sum(dataWithArc.map(({ value }) => value));

  return (
    <PieCenteredMetric centerY={centerY} style={{ fontSize: "12px" }}>
      {dataWithArc.map(({ value, data, id }, i) => (
        <tspan
          x={centerX}
          dy={`${i}em`}
          style={{ fill: data.textColor }}
          key={id}
        >
          {((value / total) * 100).toFixed(2)}%
        </tspan>
      ))}
    </PieCenteredMetric>
  );
}
