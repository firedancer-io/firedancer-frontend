import { Grid } from "@radix-ui/themes";
import UplotTooltip from "../../../../../uplotReact/UplotTooltip";
import type { SchedulerCounts } from "../../../../../api/types";
import {
  nonVoteColor,
  slotStatusRed,
  tipsColor,
  votesColor,
} from "../../../../../colors";
import { ChartTooltipRow } from "../../ChartTooltipRow";

interface PackBufferChartProps {
  data?: SchedulerCounts;
}

export default function PackBufferChartTooltip({ data }: PackBufferChartProps) {
  return (
    <UplotTooltip elId="pack-buffer-chart-tooltip">
      {data && (
        <Grid columns="auto auto" gapX="2">
          <ChartTooltipRow
            label="Regular"
            value={data.regular}
            color={nonVoteColor}
          />
          <ChartTooltipRow
            label="Votes"
            value={data.votes}
            color={votesColor}
          />
          <ChartTooltipRow
            label="Conflicting"
            value={data.conflicting}
            color={slotStatusRed}
          />
          <ChartTooltipRow
            label="Bundles"
            value={data.bundles}
            color={tipsColor}
          />
        </Grid>
      )}
    </UplotTooltip>
  );
}
