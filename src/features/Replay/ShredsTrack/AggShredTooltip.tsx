import { useAtomValue } from "jotai";
import { AggShredEventType } from "../../../api/entities";
import RowSeparator from "../../../components/RowSeparator";
import ReplayCursorTooltip, {
  AggTooltipHeader,
  TooltipRow,
  CursorTimestampRow,
} from "../Tooltip";
import { nsBucketSizes } from "../const";
import { hoveredAggShredsAtom, type HoveredAggShreds } from "../atoms";
import { useAggBucket } from "../useAggBucket";
import {
  aggHeaderEmitterAtom,
  aggSlotsAtom,
  aggSlotsDrawTilesAtom,
  getSlotCount,
} from "../HeaderTrack/aggAtoms";
import { resampleSlotCounts } from "../HeaderTrack/utils";
import { aggShredEvents } from "./const";
import styles from "./shredTooltip.module.css";

const seriesColorClassName: Record<AggShredEventType, string | undefined> = {
  [AggShredEventType.Repair]: styles.replayedRepairColor,
  [AggShredEventType.Reconstructed]: styles.reconstructedTextColor,
  [AggShredEventType.Turbine]: styles.replayedTurbineColor,
  [AggShredEventType.Published]: styles.publishedColor,
};

export default function AggShredTooltip() {
  const hovered = useAtomValue(hoveredAggShredsAtom);
  if (hovered == null) return null;

  return (
    <ReplayCursorTooltip>
      <AggShredTooltipContent hovered={hovered} />
    </ReplayCursorTooltip>
  );
}

interface AggShredTooltipContentProps {
  hovered: HoveredAggShreds;
}

function AggShredTooltipContent({ hovered }: AggShredTooltipContentProps) {
  const { bucketIdx, granularity, counts } = hovered;

  const slotCounts = useAggBucket(
    aggSlotsAtom,
    aggHeaderEmitterAtom,
    aggSlotsDrawTilesAtom,
    resampleSlotCounts,
    granularity,
    bucketIdx,
  );

  const bucketSizeNs = nsBucketSizes[granularity];
  const startNs = BigInt(bucketIdx) * bucketSizeNs;
  const endNs = startNs + bucketSizeNs;

  const slots = getSlotCount(slotCounts);

  return (
    <>
      <AggTooltipHeader
        startNs={startNs}
        endNs={endNs}
        granularity={granularity}
      />

      <RowSeparator />
      {aggShredEvents.map(({ type, label }) => (
        <TooltipRow
          key={type}
          label={label}
          value={counts[type] ?? 0}
          valueColorClassName={seriesColorClassName[type]}
        />
      ))}

      <RowSeparator />
      <TooltipRow label="Slots" value={slots} />

      <RowSeparator />
      <CursorTimestampRow />
    </>
  );
}
