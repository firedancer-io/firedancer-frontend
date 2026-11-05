import { useAtomValue } from "jotai";
import MonoText from "../../../components/MonoText.tsx";
import RowSeparator from "../../../components/RowSeparator.tsx";
import ReplayCursorTooltip, {
  TooltipHeader,
  TooltipRow,
} from "../Tooltip/index.tsx";
import { SlotLeaderRow } from "../Tooltip/rows.tsx";
import { getMsDurationProps } from "../Tooltip/utils.ts";
import { replayStates, tileStateColors, tileStateLabels } from "./consts.ts";
import { hoveredReplaySlotInfoAtom } from "./hoverAtoms.ts";

/**
 * The slot hovered on the replay track: how long its tile took to replay it,
 * and the time and share of that spent in each state
 */
export default function ReplayTrackSlotTooltip() {
  const segment = useAtomValue(hoveredReplaySlotInfoAtom);
  if (!segment) return null;

  const { slot, startMs, endMs, stateMs } = segment;
  const replayMs = endMs - startMs;

  return (
    <ReplayCursorTooltip>
      <TooltipHeader>Slot {slot}</TooltipHeader>
      <RowSeparator />
      <SlotLeaderRow slot={slot} />
      <TooltipRow label="Replay Time" {...getMsDurationProps(replayMs)} />
      <RowSeparator />
      {replayStates.map((state) => {
        const durationMs = stateMs.get(state);
        const { value, unit } = getMsDurationProps(durationMs);
        const pct =
          durationMs !== undefined && replayMs > 0
            ? Math.round((durationMs / replayMs) * 100)
            : 0;
        return (
          <TooltipRow
            key={state}
            label={tileStateLabels[state]}
            valueColor={tileStateColors[state]}
            value={
              value === undefined ? undefined : (
                <>
                  {value} <MonoText>{unit}</MonoText> · {pct}%
                </>
              )
            }
          />
        );
      })}
    </ReplayCursorTooltip>
  );
}
