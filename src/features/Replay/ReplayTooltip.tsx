import { useAtomValue } from "jotai";
import ShredTooltip from "./ShredsTrack/ShredTooltip";
import AggShredTooltip from "./ShredsTrack/AggShredTooltip";
import ReplaySlotTooltip from "./HeaderTrack/ReplaySlotTooltip";
import AggHeaderTooltip from "./HeaderTrack/AggHeaderTooltip";
import {
  isReplayTooltipPinnedAtom,
  tooltipTypeAtom,
  TooltipType,
} from "./atoms";

/**
 * Draw the correct tooltip for the current hovered data
 */
export default function ReplayTooltip() {
  const tooltipType = useAtomValue(tooltipTypeAtom);
  const isPinned = useAtomValue(isReplayTooltipPinnedAtom);
  if (isPinned || tooltipType == null) return null;

  switch (tooltipType) {
    case TooltipType.Shred:
      return <ShredTooltip />;
    case TooltipType.AggShred:
      return <AggShredTooltip />;
    case TooltipType.Slot:
      return <ReplaySlotTooltip />;
    case TooltipType.AggHeader:
      return <AggHeaderTooltip />;
  }
}
