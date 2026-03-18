import { Grid } from "@radix-ui/themes";
import UplotTooltip from "../../../../../uplotReact/UplotTooltip";
import { ChartTooltipRow } from "../../ChartTooltipRow";
import { computeUnitsColor } from "../../../../../colors";
import { txnExecutionDurationTooltipElId } from "../../../../Overview/SlotPerformance/ComputeUnitsCard/consts";

interface TxnExecutionDurationChartTooltipProps {
  data?: {
    bucketIdx: number;
    cuYVal: number | null | undefined;
    countYVal: number | null | undefined;
  };
  formatBucketRange: (idx: number) => string;
}

export default function TxnExecutionDurationChartTooltip({
  data,
  formatBucketRange,
}: TxnExecutionDurationChartTooltipProps) {
  return (
    <UplotTooltip elId={txnExecutionDurationTooltipElId}>
      {data && (
        <Grid columns="auto auto" gapX="2">
          <ChartTooltipRow
            label="Duration"
            value={formatBucketRange(data.bucketIdx)}
          />
          <ChartTooltipRow
            label="Avg CUs"
            value={data.cuYVal ? Math.round(data.cuYVal).toLocaleString() : "0"}
            color={computeUnitsColor}
          />
          <ChartTooltipRow
            label="Count"
            value={data.countYVal ? data.countYVal.toLocaleString() : "0"}
          />
        </Grid>
      )}
    </UplotTooltip>
  );
}
