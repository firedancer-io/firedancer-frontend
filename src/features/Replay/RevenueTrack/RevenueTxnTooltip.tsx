import { useAtomValue } from "jotai";
import { DateTime } from "luxon";
import RowSeparator from "../../../components/RowSeparator.tsx";
import { feesColor, incomeColor, tipsColor } from "../../../colors.ts";
import { nsPerMs } from "../../../consts.ts";
import { useSlotInfo } from "../../../hooks/useSlotInfo.ts";
import { getSlotGroupLeader } from "../../../utils.ts";
import ReplayCursorTooltip, {
  TooltipHeader,
  TooltipRow,
} from "../Tooltip/index.tsx";
import { formatSol } from "../Tooltip/utils.ts";
import { referenceNsAtom } from "../atoms.ts";
import { timelineSlotsAtom } from "../HeaderTrack/nonAggAtoms.ts";
import { calcAbsoluteNs } from "../utils.ts";
import { revenueSeriesHexColors, revenueSeriesLabels } from "./consts.ts";
import {
  hoveredRevenueTxnInfoAtom,
  type RevenueTxnInfo,
} from "./hoverAtoms.ts";

/** The txn hovered on the non-agg revenue track */
export default function RevenueTxnTooltip() {
  const info = useAtomValue(hoveredRevenueTxnInfoAtom);
  if (!info) return null;

  return (
    <ReplayCursorTooltip>
      <RevenueTxnTooltipContent info={info} />
    </ReplayCursorTooltip>
  );
}

function RevenueTxnTooltipContent({ info }: { info: RevenueTxnInfo }) {
  const { slot, series, meta } = info;
  const feesLamports = meta.transactionFee + meta.priorityFee;
  const seriesColor = revenueSeriesHexColors[series];

  return (
    <>
      <TooltipHeader>
        <span style={{ color: seriesColor }}>
          {revenueSeriesLabels[series]}
        </span>
      </TooltipHeader>

      <RowSeparator />
      <IntoSlotRow slot={slot} startMs={meta.loadStartMs} />

      <RowSeparator />
      <TooltipRow label="Slot" value={slot} />
      <SlotLeaderRow slot={slot} />
      <TooltipRow label="Bank" value={meta.execIdx} />

      <RowSeparator />
      <TooltipRow
        label="Income"
        value={
          <span style={{ color: incomeColor }}>
            {formatSol(feesLamports + meta.tips)} SOL
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
function IntoSlotRow({ slot, startMs }: { slot: number; startMs: number }) {
  const { slotGroups } = useAtomValue(timelineSlotsAtom);
  const slotStartMs = slotGroups
    .get(getSlotGroupLeader(slot))
    ?.slots.get(slot)?.startMs;

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
      : DateTime.fromMillis(
          Number(calcAbsoluteNs(referenceNs, startMs) / BigInt(nsPerMs)),
        ).toFormat("h:mm:ss.SSS");

  return <TooltipRow label="Time" value={time} />;
}

function SlotLeaderRow({ slot }: { slot: number }) {
  const { name, isLeader } = useSlotInfo(slot);
  return (
    <TooltipRow label="Leader" value={isLeader ? `You · ${name}` : name} />
  );
}
