import { useAtomValue } from "jotai";
import { DateTime } from "luxon";
import RowSeparator from "../../../components/RowSeparator";
import { nsPerMs } from "../../../consts";
import { useSlotInfo } from "../../../hooks/useSlotInfo";
import { getSlotGroupLeader } from "../../../utils";
import { referenceNsAtom } from "../atoms";
import { timelineSlotsAtom } from "../HeaderTrack/nonAggAtoms";
import { calcAbsoluteNs } from "../utils";
import { TooltipRow } from ".";

export function SlotLeaderRow({ slot }: { slot: number }) {
  const { name, isLeader } = useSlotInfo(slot);
  return (
    <TooltipRow label="Slot Leader" value={isLeader ? `You · ${name}` : name} />
  );
}

interface TxnSlotRowsProps {
  slot: number;
  /** When the txn started (relative ms) */
  startMs: number | undefined;
  /** The txn's execrp tile number */
  execrpId: number | undefined;
}

/**
 * When a txn started, as a time and into its slot, then its slot's leader and
 * its execrp tile
 */
export function TxnSlotRows({ slot, startMs, execrpId }: TxnSlotRowsProps) {
  const referenceNs = useAtomValue(referenceNsAtom);
  const { slotGroups } = useAtomValue(timelineSlotsAtom);
  const slotStartMs = slotGroups
    .get(getSlotGroupLeader(slot))
    ?.slots.get(slot)?.startMs;

  const time =
    startMs === undefined || referenceNs == null
      ? undefined
      : DateTime.fromMillis(
          Number(calcAbsoluteNs(referenceNs, startMs) / BigInt(nsPerMs)),
        ).toFormat("h:mm:ss.SSS");
  const intoSlotMs =
    startMs === undefined || slotStartMs === undefined
      ? undefined
      : (startMs - slotStartMs).toFixed(1);

  return (
    <>
      <TooltipRow label="Time" value={time} />
      <TooltipRow label="Into Slot" value={intoSlotMs} unit="ms" />
      <RowSeparator />
      <SlotLeaderRow slot={slot} />
      <TooltipRow label="Execrp" value={execrpId} />
    </>
  );
}
