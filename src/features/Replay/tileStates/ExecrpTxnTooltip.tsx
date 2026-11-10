import { useAtomValue } from "jotai";
import { tilesAtom } from "../../../api/atoms.ts";
import { TileState } from "../../../api/entities.ts";
import RowSeparator from "../../../components/RowSeparator.tsx";
import { txnErrorCodeMap } from "../../../consts.ts";
import { errorToggleColor, successToggleColor } from "../../../colors.ts";
import { hoveredExecrpTxnAtom, type HoveredExecrpTxn } from "../atoms.ts";
import ReplayCursorTooltip, {
  IntoSlotRow,
  SlotLeaderRow,
  TimeRow,
  TooltipHeader,
  TooltipRow,
} from "../Tooltip/index.tsx";
import { msToDurationUnits } from "../Tooltip/utils.ts";
import { tileStateLabels } from "./consts.ts";
import type { TxnStates } from "./hoverUtils.ts";

const EXEC_STATES = [
  TileState.Loading,
  TileState.Validate,
  TileState.Execute,
  TileState.PostExecute,
] as const;

// a sigverify pass alone isn't a success: execution may not be loaded yet
function getResultCode({ exec, sigverify }: TxnStates) {
  const failureCode = exec?.errorCode || sigverify?.errorCode;
  return failureCode || exec?.errorCode;
}

export default function ExecrpTxnTooltip() {
  const hovered = useAtomValue(hoveredExecrpTxnAtom);
  if (!hovered) return null;

  return (
    <ReplayCursorTooltip>
      <ExecrpTxnTooltipContent hovered={hovered} />
    </ReplayCursorTooltip>
  );
}

function ExecrpTxnTooltipContent({ hovered }: { hovered: HoveredExecrpTxn }) {
  const tiles = useAtomValue(tilesAtom);
  const { slot, state, states } = hovered;
  const { exec, sigverify } = states;
  // the hovered segment, else whichever is loaded
  const segment =
    (state === TileState.Sigverify ? sigverify : exec) ?? exec ?? sigverify;

  return (
    <>
      <TooltipHeader>
        {state != null ? tileStateLabels[state] : "—"}
      </TooltipHeader>

      <RowSeparator />
      <IntoSlotRow startMs={segment?.startMs} />

      <RowSeparator />
      <TooltipRow label="Slot" value={slot} />
      <SlotLeaderRow slot={slot} />
      <TooltipRow
        label="Execrp"
        value={segment && tiles?.[segment.tileIdx]?.kind_id}
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
      <ResultRow errorCode={getResultCode(states)} />

      <RowSeparator />
      <TimeRow startMs={segment?.startMs} />
    </>
  );
}

function ResultRow({ errorCode }: { errorCode: number | null | undefined }) {
  if (errorCode == null) return <TooltipRow label="Result" value={undefined} />;

  const isSuccess = errorCode === 0;
  return (
    <TooltipRow
      label="Result"
      value={isSuccess ? "Success" : txnErrorCodeMap[errorCode]}
      valueColor={isSuccess ? successToggleColor : errorToggleColor}
    />
  );
}
