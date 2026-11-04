import RowSeparator from "../../../components/RowSeparator";
import ReplayCursorTooltip, {
  TooltipHeader,
  TooltipRow,
  CursorTimestampRow,
} from "../Tooltip";
import { useAtomValue } from "jotai";
import { formatTooltipTime } from "../Tooltip/utils";
import { nsBucketSizes } from "../const";
import { hoveredAggHeaderAtom, type HoveredAggHeader } from "../atoms";
import { aggShredEvents } from "../ShredsTrack/const";
import { useAggShredsCount } from "../ShredsTrack/useAggShredsCount";
import { useAggSlotsCount } from "./useAggSlotsCount";
import styles from "./replaySlotTooltip.module.css";

export default function AggHeaderTooltip() {
  const hovered = useAtomValue(hoveredAggHeaderAtom);
  if (hovered == null) return null;

  return (
    <ReplayCursorTooltip>
      <AggHeaderTooltipContent hovered={hovered} />
    </ReplayCursorTooltip>
  );
}

interface AggHeaderTooltipContentProps {
  hovered: HoveredAggHeader;
}

function AggHeaderTooltipContent({ hovered }: AggHeaderTooltipContentProps) {
  const { bucketIdx, granularity } = hovered;

  const slotCounts = useAggSlotsCount(granularity, bucketIdx);
  const shredCounts = useAggShredsCount(granularity, bucketIdx);

  const bucketSizeNs = nsBucketSizes[granularity];
  const startNs = BigInt(bucketIdx) * bucketSizeNs;
  const endNs = startNs + bucketSizeNs;

  const slots =
    slotCounts?.start_slot != null && slotCounts.end_slot != null
      ? slotCounts.end_slot - slotCounts.start_slot + 1
      : undefined;

  const shreds = shredCounts
    ? aggShredEvents.reduce(
        (sum, { type }) => sum + (shredCounts[type] ?? 0),
        0,
      )
    : undefined;

  return (
    <>
      <TooltipHeader>
        <span className={styles.aggHeader}>
          <span>
            {formatTooltipTime(startNs)} – {formatTooltipTime(endNs)}
          </span>
          <span className={styles.aggHeaderGranularity}>{granularity}</span>
        </span>
      </TooltipHeader>

      <RowSeparator />
      <TooltipRow label="Slots" value={slots} />
      <TooltipRow
        label="Skipped"
        value={slotCounts?.skipped}
        valueColorClassName={styles.skipped}
      />
      <TooltipRow
        label="Yours"
        value={slotCounts?.mine}
        valueColorClassName={styles.mine}
      />
      <TooltipRow label="Yours skipped" value={slotCounts?.mine_skipped} />

      <RowSeparator />
      <TooltipRow label="Shreds" value={shreds} />

      <RowSeparator />
      <CursorTimestampRow />
    </>
  );
}
