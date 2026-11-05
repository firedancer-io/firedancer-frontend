import { atom } from "jotai";
import { hoveredMsAtom, referenceNsAtom, visibleRangeAtom } from "../atoms";
import { aggCpuAtom } from "./atoms";
import { MAX_UTILIZATION, type CpuRow } from "./const";
import { getRowsUtilizationAt } from "./utils";

/** The CPU track's rows while the cursor is over it */
export const hoveredCpuRowsAtom = atom<CpuRow[] | undefined>(undefined);

export interface CpuRowInfo {
  label: string;
  /** 0 to 100, undefined without a sample */
  utilizationPct: number | undefined;
}

/** Each CPU track row's utilization at the hovered time */
export const hoveredCpuInfoAtom = atom<CpuRowInfo[] | undefined>((get) => {
  const rows = get(hoveredCpuRowsAtom);
  const ms = get(hoveredMsAtom);
  const referenceNs = get(referenceNsAtom);
  const visibleRange = get(visibleRangeAtom);
  if (!rows || ms === undefined || referenceNs == null || !visibleRange) return;

  const utilization = getRowsUtilizationAt(
    rows,
    referenceNs,
    visibleRange,
    get(aggCpuAtom),
    ms,
  );
  return rows.map(({ label }, i) => {
    const value = utilization[i];
    return {
      label,
      utilizationPct:
        value === undefined ? undefined : (value / MAX_UTILIZATION) * 100,
    };
  });
});
