import { useAtomValue } from "jotai";
import RowSeparator from "../../../components/RowSeparator.tsx";
import { hoveredSlotAtom } from "../atoms.ts";
import ReplayCursorTooltip, {
  CursorTimestampRow,
  TooltipHeader,
  TooltipRow,
} from "../Tooltip/index.tsx";
import { tileBusyGreenColor, tileBusyRedColor } from "../../../colors.ts";
import { convertToWebGlColor } from "../../WebGl/webglUtils.ts";
import { hoveredCpuInfoAtom } from "./hoverAtoms.ts";

const idleColor = convertToWebGlColor(tileBusyGreenColor);
const busyColor = convertToWebGlColor(tileBusyRedColor);

/** Mirrors the sparkline shader's color, idle green to busy red */
function getUtilizationColor(utilizationPct: number) {
  const t = Math.min(Math.max(utilizationPct / 100, 0), 1);
  const [r, g, b] = idleColor.map((idle, i) =>
    Math.round((idle + (busyColor[i] - idle) * t) * 255),
  );
  return `rgb(${r} ${g} ${b})`;
}

/** Each CPU track row's work % at the hovered time */
export default function CpuTooltip() {
  const rows = useAtomValue(hoveredCpuInfoAtom);
  const slot = useAtomValue(hoveredSlotAtom);
  if (!rows) return null;

  return (
    <ReplayCursorTooltip>
      <TooltipHeader>Tile CPU</TooltipHeader>
      <RowSeparator />
      <CursorTimestampRow />
      <TooltipRow label="Slot" value={slot} />
      <RowSeparator />
      {rows.map(({ label, utilizationPct }) => (
        <TooltipRow
          key={label}
          label={label}
          value={
            utilizationPct === undefined
              ? undefined
              : `${Math.round(utilizationPct)}%`
          }
          valueColor={
            utilizationPct === undefined
              ? undefined
              : getUtilizationColor(utilizationPct)
          }
        />
      ))}
    </ReplayCursorTooltip>
  );
}
