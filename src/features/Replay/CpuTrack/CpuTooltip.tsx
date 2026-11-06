import { useAtomValue } from "jotai";
import RowSeparator from "../../../components/RowSeparator";
import { tileBusyGreenColor, tileBusyRedColor } from "../../../colors";
import ReplayCursorTooltip, {
  CursorTimestampRow,
  TooltipHeader,
  TooltipRow,
} from "../Tooltip";
import {
  hoveredAggCpuAtom,
  hoveredSlotAtom,
  type HoveredAggCpu,
} from "../atoms";
import { useAggBucket } from "../useAggBucket";
import { aggCpuAtom, aggCpuEmitterAtom, cpuRowsAtom } from "./atoms";
import { MAX_UTILIZATION } from "./const";
import { meanRowUtilization } from "./utils";

const MAX_TOOLTIP_ROWS = 20;

export default function CpuTooltip() {
  const hovered = useAtomValue(hoveredAggCpuAtom);
  if (hovered == null) return null;

  return (
    <ReplayCursorTooltip>
      <CpuTooltipContent hovered={hovered} />
    </ReplayCursorTooltip>
  );
}

interface CpuTooltipContentProps {
  hovered: HoveredAggCpu;
}

function CpuTooltipContent({ hovered }: CpuTooltipContentProps) {
  const { bucketIdx, granularity } = hovered;

  const rows = useAtomValue(cpuRowsAtom);
  const slot = useAtomValue(hoveredSlotAtom);
  const tilesUtilization = useAggBucket(
    aggCpuAtom,
    aggCpuEmitterAtom,
    granularity,
    bucketIdx,
  );

  const hiddenRowCount = rows.length - MAX_TOOLTIP_ROWS;

  return (
    <>
      <TooltipHeader>Tile CPU</TooltipHeader>

      {slot !== undefined && (
        <>
          <RowSeparator />
          <TooltipRow label="Slot" value={slot} />
        </>
      )}

      <RowSeparator />
      {rows.slice(0, MAX_TOOLTIP_ROWS).map(({ key, label, tileIdxs }) => {
        const utilization = meanRowUtilization(tilesUtilization, tileIdxs);
        const pct =
          utilization === undefined
            ? undefined
            : Math.round((utilization / MAX_UTILIZATION) * 100);
        return (
          <TooltipRow
            key={key}
            label={label}
            value={
              pct === undefined ? undefined : (
                <span
                  style={{
                    color: `color-mix(in srgb, ${tileBusyGreenColor}, ${tileBusyRedColor} ${pct}%)`,
                  }}
                >
                  {pct} %
                </span>
              )
            }
          />
        );
      })}
      {hiddenRowCount > 0 && (
        <TooltipRow label={`+${hiddenRowCount} more`} value="" />
      )}

      <RowSeparator />
      <CursorTimestampRow />
    </>
  );
}
