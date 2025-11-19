import { Text } from "@radix-ui/themes";
import AutoSizer from "react-virtualized-auto-sizer";
import styles from "./pieChart.module.css";
import type { ComputedDatum, PieTooltipProps } from "@nivo/pie";
import { Pie } from "@nivo/pie";
import { useMemo } from "react";
import { formatNumberLamports } from "../Overview/ValidatorsCard/formatAmt";
import { sum } from "lodash";
import {
  failureColor,
  nonDelinquentChartColor,
  nonDelinquentColor,
} from "../../colors";

interface ValidatorStatsChartProps {
  activeStake: bigint;
  delinquentStake: bigint;
}
export default function ValidatorStatsChart({
  activeStake,
  delinquentStake,
}: ValidatorStatsChartProps) {
  const data = useMemo(() => {
    return [
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
    ];
  }, [activeStake, delinquentStake]);

  return (
    <AutoSizer>
      {({ height, width }) => {
        return (
          <Pie
            height={height}
            width={width}
            data={data}
            colors={{ datum: "data.color" }}
            enableArcLabels={false}
            enableArcLinkLabels={false}
            layers={["arcs", CenteredMetric]}
            tooltip={Tooltip}
            animate={false}
            innerRadius={0.7}
          />
        );
      }}
    </AutoSizer>
  );
}

const CenteredMetric = ({
  dataWithArc,
  centerX,
  centerY,
}: {
  dataWithArc: readonly ComputedDatum<{
    id: string;
    label: string;
    value: number;
    color: string;
    textColor: string;
  }>[];
  centerX: number;
  centerY: number;
  innerRadius: number;
  radius: number;
}) => {
  const total = sum(dataWithArc.map(({ value }) => value));

  return (
    <text
      y={centerY - 6}
      textAnchor="middle"
      dominantBaseline="central"
      style={{
        fontSize: "12px",
        fill: "red",
      }}
    >
      {dataWithArc.map(({ value, data, id }, i) => {
        return (
          <tspan
            x={centerX}
            dy={`${i}em`}
            style={{ fill: data.textColor }}
            key={id}
          >
            {((value / total) * 100).toFixed(2)}%
          </tspan>
        );
      })}
    </text>
  );
};

function Tooltip(
  props: PieTooltipProps<{
    id: string;
    label: string;
    value: number;
    color: string;
  }>,
) {
  const value = props.datum.value;
  const fmtValue = formatNumberLamports(BigInt(value));

  return (
    <div className={styles.tooltip}>
      <Text>
        {props.datum.label}:&nbsp;{fmtValue}
      </Text>
    </div>
  );
}
