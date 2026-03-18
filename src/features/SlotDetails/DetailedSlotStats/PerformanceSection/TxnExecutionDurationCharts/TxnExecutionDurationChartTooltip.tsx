import { Grid } from "@radix-ui/themes";
import UplotTooltip from "../../../../../uplotReact/UplotTooltip";
import { ChartTooltipRow } from "../../ChartTooltipRow";
import { computeUnitsColor } from "../../../../../colors";

interface TxnExecutionDurationChartTooltipProps {
  elId: string;
  data?: {
    bucketIdx: number;
    cuYVal: number | null | undefined;
    countYVal: number | null | undefined;
  };
  formatBucketRange: (idx: number) => string;
}

export default function TxnExecutionDurationChartTooltip({
  elId,
  data,
  formatBucketRange,
}: TxnExecutionDurationChartTooltipProps) {
  return (
    <UplotTooltip elId={elId}>
      {data && (
        <Grid columns="auto auto" gapX="2">
          <ChartTooltipRow
            label="Duration"
            value={data.bucketIdx}
            formatter={formatBucketRange}
          />
          <ChartTooltipRow
            label="Avg CUs"
            value={data.cuYVal ?? 0}
            color={computeUnitsColor}
            formatter={(v) => Math.round(v).toLocaleString()}
          />
          <ChartTooltipRow
            label="Count"
            value={data.countYVal ?? 0}
            formatter={(v) => v.toLocaleString()}
          />
        </Grid>
      )}
    </UplotTooltip>
  );
}
