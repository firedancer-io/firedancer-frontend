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
import ReplayCursorTooltip, {
  TooltipHeader,
  TooltipRow,
} from "../Tooltip/index.tsx";
import { TxnSlotRows } from "../Tooltip/rows.tsx";
import { getMsDurationProps } from "../Tooltip/utils.ts";
import { tileStateColors, tileStateLabels } from "./consts.ts";
import { hoveredExecrpTxnInfoAtom } from "./hoverAtoms.ts";

/** Execution stages in order, with the slot details tooltip's text colors */
const EXEC_STATES = [
  { state: TileState.Loading, color: stateTextColors[TxnState.LOADING] },
  { state: TileState.Validate, color: stateTextColors[TxnState.VALIDATE] },
  { state: TileState.Execute, color: stateTextColors[TxnState.EXECUTE] },
  {
    state: TileState.PostExecute,
    color: stateTextColors[TxnState.POST_EXECUTE],
  },
] as const;

/** The txn hovered on the execrp track */
export default function ExecrpTxnTooltip() {
  const info = useAtomValue(hoveredExecrpTxnInfoAtom);
  const tiles = useAtomValue(tilesAtom);
  if (!info) return null;

  const {
    slot,
    states: { exec, sigverify },
  } = info;
  const errorCode = exec?.errorCode;

  return (
    <ReplayCursorTooltip>
      <TooltipHeader color={stateTextColors[TxnState.EXECUTE]}>
        {tileStateLabels[TileState.Execute]}
      </TooltipHeader>
      <RowSeparator />
      <TxnSlotRows
        slot={slot}
        startMs={exec?.startMs}
        execrpId={exec && tiles?.[exec.tileIdx]?.kind_id}
      />
      <RowSeparator />
      {EXEC_STATES.map(({ state, color }) => (
        <TooltipRow
          key={state}
          label={tileStateLabels[state]}
          valueColor={color}
          {...getMsDurationProps(exec?.stateMs.get(state))}
        />
      ))}
      <TooltipRow
        label={tileStateLabels[TileState.Sigverify]}
        valueColor={tileStateColors[TileState.Sigverify]}
        {...getMsDurationProps(sigverify?.stateMs.get(TileState.Sigverify))}
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
    </ReplayCursorTooltip>
  );
}
