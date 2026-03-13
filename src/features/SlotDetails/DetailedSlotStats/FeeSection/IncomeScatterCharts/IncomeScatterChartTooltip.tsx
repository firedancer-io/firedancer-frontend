import { Grid } from "@radix-ui/themes";
import UplotTooltip from "../../../../../uplotReact/UplotTooltip";
import { incomePerCuToggleControlColor } from "../../../../../colors";
import { formatNumberLamports } from "../../../../Overview/ValidatorsCard/formatAmt";
import { maxSolDecimals } from "../../../../../consts";
import { ChartTooltipRow } from "../../ChartTooltipRow";

interface IncomeScatterChartTooltipProps {
  elId: string;
  xVal: number | null | undefined;
  yVal: number | null | undefined;
  xLabel: string;
  xColor?: string;
  formatX: (x: number) => string;
}

export default function IncomeScatterChartTooltip({
  elId,
  xVal,
  yVal,
  xLabel,
  xColor,
  formatX,
}: IncomeScatterChartTooltipProps) {
  return (
    <UplotTooltip elId={elId}>
      {xVal != null && yVal != null && (
        <Grid columns="auto auto" gapX="2">
          <ChartTooltipRow
            label={xLabel}
            value={xVal}
            color={xColor}
            formatter={formatX}
          />
          <ChartTooltipRow
            label="Income"
            value={yVal}
            color={incomePerCuToggleControlColor}
            formatter={(v) => `${formatNumberLamports(v, maxSolDecimals)} SOL`}
          />
        </Grid>
      )}
    </UplotTooltip>
  );
}
