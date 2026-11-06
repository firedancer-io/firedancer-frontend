import RowSeparator from "../../../components/RowSeparator";
import ReplayCursorTooltip, {
  AggTooltipHeader,
  TooltipRow,
  CursorTimestampRow,
} from "../Tooltip";
import { useAtomValue } from "jotai";
import { nsBucketSizes } from "../const";
import { hoveredAggHeaderAtom, type HoveredAggHeader } from "../atoms";
import { getAggShredCount } from "../ShredsTrack/aggUtils";
import { aggShredsAtom, aggShredsEmitterAtom } from "../ShredsTrack/atoms";
import { useAggBucket } from "../useAggBucket";
import { aggHeaderEmitterAtom, aggSlotsAtom, getSlotCount } from "./aggAtoms";
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

  const bucketSizeNs = nsBucketSizes[granularity];
  const startNs = BigInt(bucketIdx) * bucketSizeNs;
  const endNs = startNs + bucketSizeNs;

  const slotCounts = useAggBucket(
    aggSlotsAtom,
    aggHeaderEmitterAtom,
    granularity,
    bucketIdx,
  );
  const shredCounts = useAggBucket(
    aggShredsAtom,
    aggShredsEmitterAtom,
    granularity,
    bucketIdx,
  );

  const slots = getSlotCount(slotCounts);

  // hide if shreds data is unavailable for this granularity and bucket
  const shreds = shredCounts ? getAggShredCount(shredCounts) : undefined;

  return (
    <>
      <AggTooltipHeader
        startNs={startNs}
        endNs={endNs}
        granularity={granularity}
      />

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

      {shreds != null && (
        <>
          <RowSeparator />
          <TooltipRow label="Shreds" value={shreds} />
        </>
      )}

      <RowSeparator />
      <CursorTimestampRow />
    </>
  );
}
