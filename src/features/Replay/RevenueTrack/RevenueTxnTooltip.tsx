import { useAtomValue } from "jotai";
import RowSeparator from "../../../components/RowSeparator.tsx";
import { feesColor, incomeColor, tipsColor } from "../../../colors.ts";
import { useSlotInfo } from "../../../hooks/useSlotInfo.ts";
import ReplayCursorTooltip, {
  TooltipHeader,
  TooltipRow,
} from "../Tooltip/index.tsx";
import { formatSol, formatTooltipTime, sumLamports } from "../Tooltip/utils.ts";
import {
  hoveredRevenueTxnAtom,
  hoveredSlotInfoAtom,
  referenceNsAtom,
  type HoveredRevenueTxn,
} from "../atoms.ts";
import { calcAbsoluteNs } from "../utils.ts";
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
      <TxnTimeRow startMs={meta.loadStartMs} />
    </>
  );
}

/** How far the txn started into its slot */
function IntoSlotRow({ startMs }: { startMs: number }) {
  const slotStartMs = useAtomValue(hoveredSlotInfoAtom)?.startMs;

  const intoSlotMs =
    slotStartMs === undefined ? undefined : (startMs - slotStartMs).toFixed(0);

  return <TooltipRow label="Into slot" value={intoSlotMs} unit="ms" />;
}

/** When the txn started (its load-start time) */
function TxnTimeRow({ startMs }: { startMs: number }) {
  const referenceNs = useAtomValue(referenceNsAtom);

  const time =
    referenceNs == null
      ? undefined
      : formatTooltipTime(calcAbsoluteNs(referenceNs, startMs));

  return <TooltipRow label="Time" value={time} />;
}

function SlotLeaderRow({ slot }: { slot: number }) {
  const { name, isLeader } = useSlotInfo(slot);
  return (
    <TooltipRow label="Leader" value={isLeader ? `You · ${name}` : name} />
  );
}
