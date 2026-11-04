import { useAtomValue } from "jotai";
import { AggShredEventType } from "../../../api/entities";
import RowSeparator from "../../../components/RowSeparator";
import ReplayCursorTooltip, {
  TooltipHeader,
  TooltipRow,
  CursorTimestampRow,
} from "../Tooltip";
import { formatTooltipTime } from "../Tooltip/utils";
import { nsBucketSizes } from "../const";
import { hoveredAggShredsAtom, type HoveredAggShreds } from "../atoms";
import { useAggSlotsCount } from "../HeaderTrack/useAggSlotsCount";
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

  const slotCounts = useAggSlotsCount(granularity, bucketIdx);

  const bucketSizeNs = nsBucketSizes[granularity];
  const startNs = BigInt(bucketIdx) * bucketSizeNs;
  const endNs = startNs + bucketSizeNs;

  const slots =
    slotCounts?.start_slot != null && slotCounts.end_slot != null
      ? slotCounts.end_slot - slotCounts.start_slot + 1
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
