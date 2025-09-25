// import styles from "./cuChartTooltip.module.css";
import { Grid, Text } from "@radix-ui/themes";
import UplotTooltip from "../../../../../uplotReact/UplotTooltip";
import type { SchedulerCounts } from "../../../../../api/types";
import {
  nonVoteColor,
  slotStatusRed,
  tipsColor,
  votesColor,
} from "../../../../../colors";

interface PackBufferChartProps {
  data?: SchedulerCounts;
}

export default function PackBufferChartTooltip({ data }: PackBufferChartProps) {
  return (
    <UplotTooltip elId="pack-buffer-chart-tooltip">
      {data && (
        <Grid columns="auto auto" gapX="2">
          <Row label="Regular" value={data.regular} color={nonVoteColor} />
          <Row label="Votes" value={data.votes} color={votesColor} />
          <Row
            label="Conflicting"
            value={data.conflicting}
            color={slotStatusRed}
          />
          <Row label="Bundles" value={data.bundles} color={tipsColor} />
        </Grid>
      )}
    </UplotTooltip>
  );
}

interface RowProps {
  label: string;
  value: number;
  color: string;
}

function Row({ label, value, color }: RowProps) {
  return (
    <>
      <Text style={{ color: "var(--gray-11)" }}>{label}</Text>
      <Text style={{ color }}>{value.toLocaleString()}</Text>
    </>
  );
}
