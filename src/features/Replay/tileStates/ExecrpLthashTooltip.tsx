import { useAtomValue } from "jotai";
import { tilesAtom } from "../../../api/atoms.ts";
import { TileState } from "../../../api/entities.ts";
import RowSeparator from "../../../components/RowSeparator.tsx";
import { hoveredExecrpLthashAtom, type HoveredExecrpLthash } from "../atoms.ts";
import ReplayCursorTooltip, {
  IntoSlotRow,
  SlotLeaderRow,
  TimeRow,
  TooltipHeader,
  TooltipRow,
} from "../Tooltip/index.tsx";
import { msToDurationUnits } from "../Tooltip/utils.ts";
import { tileStateLabels } from "./consts.ts";

export default function ExecrpLthashTooltip() {
  const hovered = useAtomValue(hoveredExecrpLthashAtom);
  if (!hovered) return null;

  return (
    <ReplayCursorTooltip>
      <ExecrpLthashTooltipContent hovered={hovered} />
    </ReplayCursorTooltip>
  );
}

function ExecrpLthashTooltipContent({
  hovered,
}: {
  hovered: HoveredExecrpLthash;
}) {
  const tiles = useAtomValue(tilesAtom);
  const { slot, tileIdx, startMs, endMs } = hovered;

  return (
    <>
      <TooltipHeader>{tileStateLabels[TileState.Lthash]}</TooltipHeader>

      <RowSeparator />
      <IntoSlotRow startMs={startMs} />

      <RowSeparator />
      <TooltipRow label="Slot" value={slot} />
      <SlotLeaderRow slot={slot} />
      <TooltipRow label="Execrp" value={tiles?.[tileIdx]?.kind_id} />

      <RowSeparator />
      <TooltipRow label="Duration" {...msToDurationUnits(endMs - startMs)} />

      <RowSeparator />
      <TimeRow startMs={startMs} />
    </>
  );
}
