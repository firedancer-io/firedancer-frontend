import { getDefaultStore, useAtomValue } from "jotai";
import { useEffect, useReducer } from "react";
import {
  hoveredCpuRowsAtom,
  hoveredMsAtom,
  referenceNsAtom,
  visibleRangeAtom,
} from "../atoms";
import { tileBusyGreenColor, tileBusyRedColor } from "../../../colors";
import { convertToWebGlColor } from "../../WebGl/webglUtils";
import { aggCpuAtom, aggCpuEmitterAtom, drawEventType } from "./atoms";
import { MAX_UTILIZATION } from "./const";
import { getRowsUtilizationAt } from "./utils";

const store = getDefaultStore();

const idleColor = convertToWebGlColor(tileBusyGreenColor);
const busyColor = convertToWebGlColor(tileBusyRedColor);

function getUtilizationColor(utilizationPct: number) {
  const t = Math.min(Math.max(utilizationPct / 100, 0), 1);
  const [r, g, b] = idleColor.map((idle, i) =>
    Math.round((idle + (busyColor[i] - idle) * t) * 255),
  );
  return `rgb(${r} ${g} ${b})`;
}

export interface CpuRowInfo {
  key: string;
  label: string;
  /** 0 to 100, undefined without a sample */
  utilizationPct: number | undefined;
  color: string | undefined;
}

/** Each CPU track row's utilization at the hovered time */
export function useHoveredCpuInfo(): CpuRowInfo[] | undefined {
  const rows = useAtomValue(hoveredCpuRowsAtom);
  const ms = useAtomValue(hoveredMsAtom);
  const referenceNs = useAtomValue(referenceNsAtom);
  const visibleRange = useAtomValue(visibleRangeAtom);

  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const emitter = store.get(aggCpuEmitterAtom);
    emitter.addListener(drawEventType, forceUpdate);
    return () => {
      emitter.removeListener(drawEventType, forceUpdate);
    };
  }, []);

  if (!rows || ms === undefined || referenceNs == null || !visibleRange) return;

  const utilization = getRowsUtilizationAt(
    rows,
    referenceNs,
    visibleRange,
    store.get(aggCpuAtom),
    ms,
  );
  return rows.map(({ key, label }, i) => {
    const value = utilization[i];
    const utilizationPct =
      value === undefined ? undefined : (value / MAX_UTILIZATION) * 100;
    return {
      key,
      label,
      utilizationPct,
      color:
        utilizationPct === undefined
          ? undefined
          : getUtilizationColor(utilizationPct),
    };
  });
}
