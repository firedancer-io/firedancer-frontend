import { useAtomValue } from "jotai";
import ShredTooltip from "./ShredsTrack/ShredTooltip";
import AggShredTooltip from "./ShredsTrack/AggShredTooltip";
import AggRevenueTooltip from "./RevenueTrack/AggRevenueTooltip";
import ReplaySlotTooltip from "./HeaderTrack/ReplaySlotTooltip";
import AggHeaderTooltip from "./HeaderTrack/AggHeaderTooltip";
import { hoveredExecrpTxnInfoAtom } from "./TileStatesTrack/hoverAtoms";
import { tooltipTypeAtom, TooltipType } from "./atoms";

/**
 * Draw the correct tooltip for the current hovered data
 */
export default function ReplayTooltip() {
  const tooltipType = useAtomValue(tooltipTypeAtom);
  const execrpTxn = useAtomValue(hoveredExecrpTxnInfoAtom);
  if (tooltipType == null || execrpTxn != null) return null;

  switch (tooltipType) {
    case TooltipType.Shred:
      return <ShredTooltip />;
    case TooltipType.AggShred:
      return <AggShredTooltip />;
    case TooltipType.AggRevenue:
      return <AggRevenueTooltip />;
    case TooltipType.Slot:
      return <ReplaySlotTooltip />;
    case TooltipType.AggHeader:
      return <AggHeaderTooltip />;
  }
}
