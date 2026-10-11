import { useMemo } from "react";
import type { ComputedDatum } from "@nivo/pie";
import { formatNumberLamports } from "../Overview/ValidatorsCard/formatAmt";
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
  stake: bigint;
  totalNetworkStake: bigint | undefined;
  color: string;
  description: string;
};

interface ValidatorStatsChartProps {
  nonDelinquentStake?: bigint;
  delinquentStake?: bigint;
  totalNetworkStake?: bigint;
}

export default function ValidatorStatsChart({
  nonDelinquentStake,
  delinquentStake,
  totalNetworkStake,
}: ValidatorStatsChartProps) {
  const data = useMemo(() => {
    if (nonDelinquentStake === undefined || delinquentStake === undefined)
      return [];

    return [
      {
        id: "non-delinquent",
        label: "Non-delinquent",
        value: Number(nonDelinquentStake),
        stake: nonDelinquentStake,
        totalNetworkStake,
        color: nonDelinquentChartColor,
        description:
          "An identity's full effective current epoch stake is non-delinquent if its peer is present, not removed, and any vote account is non-delinquent according to the backend, regardless of gossip connectivity.",
      },
      {
        id: "delinquent",
        label: "Delinquent",
        value: Number(delinquentStake),
        stake: delinquentStake,
        totalNetworkStake,
        color: failureColor,
        description:
          "All remaining effective current epoch stake is delinquent: identities with all vote accounts delinquent, missing or removed peers, peers without vote accounts, and excluded stake. Gossip connectivity is separate from voting status.",
      },
    ];
  }, [nonDelinquentStake, delinquentStake, totalNetworkStake]);

  return (
    <PieChart
      data={data}
      tooltipFormatter={formatTooltipValue}
      centeredMetric={CenteredMetric}
    />
  );
}

function formatTooltipValue(datum: ComputedDatum<ValidatorStakeData>) {
  return (
    <span
      style={{
        display: "inline-block",
        maxWidth: "280px",
        whiteSpace: "normal",
      }}
    >
      {formatNumberLamports(datum.data.stake)} SOL (
      {datum.data.stake.toLocaleString()} lamports)
      <br />
      {getPct(datum.data.stake, datum.data.totalNetworkStake)} of total network
      stake, including excluded stake.
      <br />
      {datum.data.description}
    </span>
  );
}

function getPct(numerator: bigint, denominator: bigint | undefined) {
  return denominator === undefined || denominator === 0n
    ? "--"
    : `${((Number(numerator) / Number(denominator)) * 100).toFixed(2)}%`;
}

function CenteredMetric({
  dataWithArc,
  centerX,
  centerY,
}: PieCenteredMetricProps<ValidatorStakeData>) {
  const nonDelinquent = dataWithArc.find(({ id }) => id === "non-delinquent");
  const delinquent = dataWithArc.find(({ id }) => id === "delinquent");

  return (
    <PieCenteredMetric centerY={centerY}>
      <tspan
        x={centerX}
        dy="-0.3em"
        style={{ fill: nonDelinquentColor, fontSize: "18px" }}
      >
        {nonDelinquent
          ? getPct(
              nonDelinquent.data.stake,
              nonDelinquent.data.totalNetworkStake,
            )
          : "--"}
      </tspan>
      <tspan
        x={centerX}
        dy="1.4em"
        style={{ fill: failureColor, fontSize: "14px" }}
      >
        {delinquent
          ? getPct(delinquent.data.stake, delinquent.data.totalNetworkStake)
          : "--"}
      </tspan>
    </PieCenteredMetric>
  );
}
