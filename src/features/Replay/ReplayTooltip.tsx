import { useAtomValue } from "jotai";
import ShredTooltip from "./ShredsTrack/ShredTooltip";
import AggShredTooltip from "./ShredsTrack/AggShredTooltip";
import AggRevenueTooltip from "./RevenueTrack/AggRevenueTooltip";
import RevenueTxnTooltip from "./RevenueTrack/RevenueTxnTooltip";
import CpuTooltip from "./CpuTrack/CpuTooltip";
import ReplaySlotTooltip from "./HeaderTrack/ReplaySlotTooltip";
import AggHeaderTooltip from "./HeaderTrack/AggHeaderTooltip";
import { hoveredExecrpTxnAtom } from "./TileStatesTrack/hoverAtoms";
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
  const execrpTxn = useAtomValue(hoveredExecrpTxnAtom);
  if (isPinned || tooltipType == null || execrpTxn != null) return null;

  switch (tooltipType) {
    case TooltipType.Shred:
      return <ShredTooltip />;
    case TooltipType.AggShred:
      return <AggShredTooltip />;
    case TooltipType.AggRevenue:
      return <AggRevenueTooltip />;
    case TooltipType.RevenueTxn:
      return <RevenueTxnTooltip />;
    case TooltipType.Cpu:
      return <CpuTooltip />;
    case TooltipType.Slot:
      return <ReplaySlotTooltip />;
    case TooltipType.AggHeader:
      return <AggHeaderTooltip />;
  }
}
