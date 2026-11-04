import { Grid } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import UplotTooltip from "../../../../../uplotReact/UplotTooltip";
import type { SchedulerCounts } from "../../../../../api/types";
import {
  nextAuctionColor,
  nonVoteColor,
  slotStatusRed,
  tipsColor,
  votesColor,
} from "../../../../../colors";
import {
  isAlpenglowAtom,
  scheduleStrategyAtom,
} from "../../../../../api/atoms";
import { ScheduleStrategyEnum } from "../../../../../api/entities";
import { ChartTooltipRow } from "../../ChartTooltipRow";

interface PackBufferChartProps {
  data?: SchedulerCounts;
}

export default function PackBufferChartTooltip({ data }: PackBufferChartProps) {
  const isAlpenglow = useAtomValue(isAlpenglowAtom);
  const isAuction =
    useAtomValue(scheduleStrategyAtom) === ScheduleStrategyEnum.auction;

  return (
    <UplotTooltip elId="pack-buffer-chart-tooltip">
      {data && (
        <Grid columns="auto auto" gapX="2">
          <ChartTooltipRow
            label="Regular"
            value={data.regular.toLocaleString()}
            color={nonVoteColor}
          />
          {!isAlpenglow && (
            <ChartTooltipRow
              label="Votes"
              value={data.votes.toLocaleString()}
              color={votesColor}
            />
          )}
          <ChartTooltipRow
            label="Conflicting"
            value={data.conflicting.toLocaleString()}
            color={slotStatusRed}
          />
          <ChartTooltipRow
            label="Bundles"
            value={data.bundles.toLocaleString()}
            color={tipsColor}
          />
          {isAuction && (
            <ChartTooltipRow
              label="Next Auction"
              value={(data.next_auction ?? 0).toLocaleString()}
              color={nextAuctionColor}
            />
          )}
        </Grid>
      )}
    </UplotTooltip>
  );
}
