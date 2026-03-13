import { Grid } from "@radix-ui/themes";
import UplotTooltip from "../../../../../uplotReact/UplotTooltip";
import { incomePerCuToggleControlColor } from "../../../../../colors";
import { formatNumberLamports } from "../../../../Overview/ValidatorsCard/formatAmt";
import { maxSolDecimals } from "../../../../../consts";
import { ChartTooltipRow } from "../../ChartTooltipRow";

interface IncomeScatterChartTooltipProps {
  elId: string;
  data?: { x: number; y: number };
  xLabel: string;
  xColor?: string;
  tooltipFormatX: (x: number) => string;
}

export default function IncomeScatterChartTooltip({
  elId,
  data,
  xLabel,
  xColor,
  tooltipFormatX,
}: IncomeScatterChartTooltipProps) {
  return (
    <UplotTooltip elId={elId}>
      {data !== undefined && (
        <Grid columns="auto auto" gapX="2">
          <ChartTooltipRow
            label={xLabel}
            value={data.x}
            color={xColor}
            formatter={tooltipFormatX}
          />
          <ChartTooltipRow
            label="Income"
            value={data.y}
            color={incomePerCuToggleControlColor}
            formatter={(v) => `${formatNumberLamports(v, maxSolDecimals)} SOL`}
          />
        </Grid>
      )}
    </UplotTooltip>
  );
}
