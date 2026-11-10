import { useAtomValue } from "jotai";
import RowSeparator from "../../../components/RowSeparator.tsx";
import { feesColor, incomeColor, tipsColor } from "../../../colors.ts";
import ReplayCursorTooltip, {
  IntoSlotRow,
  SlotLeaderRow,
  TimeRow,
  TooltipHeader,
  TooltipRow,
} from "../Tooltip/index.tsx";
import { formatSol, sumLamports } from "../Tooltip/utils.ts";
import { hoveredRevenueTxnAtom, type HoveredRevenueTxn } from "../atoms.ts";
import { revenueSeriesHexColors, revenueSeriesLabels } from "./consts.ts";

/** The txn hovered on the non-agg revenue track */
export default function RevenueTxnTooltip() {
  const info = useAtomValue(hoveredRevenueTxnAtom);
  if (!info) return null;

  return (
    <ReplayCursorTooltip>
      <RevenueTxnTooltipContent info={info} />
    </ReplayCursorTooltip>
  );
}

function RevenueTxnTooltipContent({ info }: { info: HoveredRevenueTxn }) {
  const { slot, series, meta } = info;
  const feesLamports = sumLamports(meta.transactionFee, meta.priorityFee);
  const seriesColor = revenueSeriesHexColors[series];

  return (
    <>
      <TooltipHeader>
        <span style={{ color: seriesColor }}>
          {revenueSeriesLabels[series]}
        </span>
      </TooltipHeader>

      <RowSeparator />
      <IntoSlotRow startMs={meta.loadStartMs} />

      <RowSeparator />
      <TooltipRow label="Slot" value={slot} />
      <SlotLeaderRow slot={slot} />
      <TooltipRow label="Bank" value={meta.execIdx} />

      <RowSeparator />
      <TooltipRow
        label="Income"
        value={
          <span style={{ color: incomeColor }}>
            {formatSol(sumLamports(feesLamports, meta.tips))} SOL
          </span>
        }
      />
      <TooltipRow
        label="Fees"
        value={
          <span style={{ color: feesColor }}>
            {formatSol(feesLamports)} SOL
          </span>
        }
      />
      <TooltipRow
        label="Tips"
        value={
          <span style={{ color: tipsColor }}>{formatSol(meta.tips)} SOL</span>
        }
      />

      <RowSeparator />
      <TimeRow startMs={meta.loadStartMs} />
    </>
  );
}
