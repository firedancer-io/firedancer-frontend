import { useAtomValue } from "jotai";
import { tilesAtom } from "../../../api/atoms.ts";
import { TileState } from "../../../api/entities.ts";
import RowSeparator from "../../../components/RowSeparator.tsx";
import { txnErrorCodeMap } from "../../../consts.ts";
import { errorToggleColor, successToggleColor } from "../../../colors.ts";
import {
  stateTextColors,
  TxnState,
} from "../../Overview/SlotPerformance/TransactionBarsCard/consts.ts";
import { getSlotGroupLeader } from "../../../utils.ts";
import { timelineSlotsAtom } from "../HeaderTrack/nonAggAtoms.ts";
import ReplayCursorTooltip, {
  SlotLeaderRow,
  TimeRow,
  TooltipHeader,
  TooltipRow,
} from "../Tooltip/index.tsx";
import { msToDurationUnits } from "../Tooltip/utils.ts";
import { tileStateColors, tileStateLabels } from "./consts.ts";
import { hoveredExecrpTxnAtom } from "./hoverAtoms.ts";
import { useTxnStateDurations } from "./useTxnStateDurations.ts";

const stateColors: Partial<Record<TileState, string>> = {
  [TileState.Loading]: stateTextColors[TxnState.LOADING],
  [TileState.Validate]: stateTextColors[TxnState.VALIDATE],
  [TileState.Execute]: stateTextColors[TxnState.EXECUTE],
  [TileState.PostExecute]: stateTextColors[TxnState.POST_EXECUTE],
  [TileState.Sigverify]: tileStateColors[TileState.Sigverify],
};

const EXEC_STATES = [
  TileState.Loading,
  TileState.Validate,
  TileState.Execute,
  TileState.PostExecute,
] as const;

interface TxnSlotRowsProps {
  slot: number;
  startMs: number | undefined;
  execrpId: number | undefined;
}

function TxnSlotRows({ slot, startMs, execrpId }: TxnSlotRowsProps) {
  const { slotGroups } = useAtomValue(timelineSlotsAtom);
  const slotStartMs = slotGroups
    .get(getSlotGroupLeader(slot))
    ?.slots.get(slot)?.startMs;

  const intoSlotMs =
    startMs === undefined || slotStartMs === undefined
      ? undefined
      : (startMs - slotStartMs).toFixed(1);

  return (
    <>
      <TooltipRow label="Into Slot" value={intoSlotMs} unit="ms" />
      <RowSeparator />
      <SlotLeaderRow slot={slot} />
      <TooltipRow label="Execrp" value={execrpId} />
    </>
  );
}

export default function ExecrpTxnTooltip() {
  const hovered = useAtomValue(hoveredExecrpTxnAtom);
  const states = useTxnStateDurations();
  const tiles = useAtomValue(tilesAtom);
  if (!hovered || !states) return null;

  const { slot, state } = hovered;
  const { exec, sigverify } = states;
  const errorCode = exec?.errorCode
    ? exec.errorCode
    : sigverify?.errorCode
      ? sigverify.errorCode
      : exec?.errorCode;

  return (
    <ReplayCursorTooltip>
      <TooltipHeader color={state != null ? stateColors[state] : undefined}>
        {state != null ? tileStateLabels[state] : "—"}
      </TooltipHeader>
      <RowSeparator />
      <TxnSlotRows
        slot={slot}
        startMs={exec?.startMs}
        execrpId={exec && tiles?.[exec.tileIdx]?.kind_id}
      />
      <RowSeparator />
      {EXEC_STATES.map((state) => (
        <TooltipRow
          key={state}
          label={tileStateLabels[state]}
          {...msToDurationUnits(exec?.stateMs.get(state))}
        />
      ))}
      <TooltipRow
        label={tileStateLabels[TileState.Sigverify]}
        {...msToDurationUnits(sigverify?.stateMs.get(TileState.Sigverify))}
      />
      <RowSeparator />
      <TooltipRow
        label="Result"
        value={
          errorCode == null
            ? undefined
            : errorCode === 0
              ? "Success"
              : txnErrorCodeMap[errorCode]
        }
        valueColor={
          errorCode == null
            ? undefined
            : errorCode === 0
              ? successToggleColor
              : errorToggleColor
        }
      />
      <RowSeparator />
      <TimeRow startMs={exec?.startMs} />
    </ReplayCursorTooltip>
  );
}
