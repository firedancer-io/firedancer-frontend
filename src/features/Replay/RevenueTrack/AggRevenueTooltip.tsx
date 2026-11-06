import { useAtomValue } from "jotai";
import RowSeparator from "../../../components/RowSeparator";
import { lamportsPerSol } from "../../../consts";
import ReplayCursorTooltip, {
  TooltipHeader,
  TooltipRow,
  CursorTimestampRow,
} from "../Tooltip";
import { formatTooltipTime } from "../Tooltip/utils";
import { nsBucketSizes } from "../const";
import { hoveredAggRevenueAtom, type HoveredAggRevenue } from "../atoms";
import { revenueSeriesHexColors, revenueSeriesLabels } from "./consts";
import styles from "./aggRevenueTooltip.module.css";

const LABEL_SIG_DIGITS = 3;

function formatSol(value: bigint) {
  return (Number(value) / lamportsPerSol).toLocaleString(undefined, {
    maximumSignificantDigits: LABEL_SIG_DIGITS,
  });
}

export default function AggRevenueTooltip() {
  const hovered = useAtomValue(hoveredAggRevenueAtom);
  if (hovered == null) return null;

  return (
    <ReplayCursorTooltip>
      <AggRevenueTooltipContent hovered={hovered} />
    </ReplayCursorTooltip>
  );
}

interface AggRevenueTooltipContentProps {
  hovered: HoveredAggRevenue;
}

function AggRevenueTooltipContent({ hovered }: AggRevenueTooltipContentProps) {
  const { bucketIdx, granularity, type, lamportValue: value } = hovered;

  const bucketSizeNs = nsBucketSizes[granularity];
  const startNs = BigInt(bucketIdx) * bucketSizeNs;
  const endNs = startNs + bucketSizeNs;

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
      <TooltipRow
        label={revenueSeriesLabels[type]}
        value={
          <span style={{ color: revenueSeriesHexColors[type] }}>
            {formatSol(value)} SOL
          </span>
        }
      />

      <RowSeparator />
      <CursorTimestampRow />
    </>
  );
}
