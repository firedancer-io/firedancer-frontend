import { useAtomValue } from "jotai";
import RowSeparator from "../../../components/RowSeparator";
import { hoveredSlotAtom } from "../atoms";
import ReplayCursorTooltip, {
  CursorTimestampRow,
  TooltipHeader,
  TooltipRow,
} from "../Tooltip";
import { useHoveredCpuInfo } from "./hoverAtoms";

/** Each CPU track row's work % at the hovered time */
export default function CpuTooltip() {
  const rows = useHoveredCpuInfo();
  const slot = useAtomValue(hoveredSlotAtom);
  if (!rows) return null;

  return (
    <ReplayCursorTooltip>
      <TooltipHeader>Tile CPU</TooltipHeader>

      {slot !== undefined && (
        <>
          <RowSeparator />
          <TooltipRow label="Slot" value={slot} />
        </>
      )}

      <RowSeparator />
      <div>
        {rows.slice(0, 50).map(({ key, label, utilizationPct, color }) => (
          <TooltipRow
            key={key}
            label={label}
            value={
              utilizationPct === undefined ? undefined : (
                <span style={{ color }}>{Math.round(utilizationPct)} %</span>
              )
            }
          />
        ))}
      </div>

      <RowSeparator />
      <CursorTimestampRow />
    </ReplayCursorTooltip>
  );
}
