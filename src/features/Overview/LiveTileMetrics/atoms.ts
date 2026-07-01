import { atom } from "jotai";
import { atomFamily, selectAtom } from "jotai/utils";
import { isEqual } from "lodash";
import { liveTileMetricsAtom, tileTimerAtom } from "../../../api/atoms";
import type { Priority, TileMetrics } from "../../../api/types";

export interface TileRowMetrics {
  timers?: number[] | null;
  sched_timers?: number[] | null;
  in_backp?: boolean | null;
  backp_msgs?: number | null;
  alive?: number | null;
  nvcsw?: number | null;
  nivcsw?: number | null;
  last_cpu?: number | null;
  minflt?: number | null;
  majflt?: number | null;
  priority?: Priority | null;
}

function getTileRow(m: TileMetrics, idx: number): TileRowMetrics {
  return {
    timers: m.timers[idx],
    sched_timers: m.sched_timers[idx],
    in_backp: m.in_backp[idx],
    backp_msgs: m.backp_msgs[idx],
    alive: m.alive[idx],
    nvcsw: m.nvcsw[idx],
    nivcsw: m.nivcsw[idx],
    last_cpu: m.last_cpu[idx],
    minflt: m.minflt[idx],
    majflt: m.majflt[idx],
    priority: m.priority?.[idx],
  };
}

export const liveTileRowAtomFamily = atomFamily((idx: number) =>
  selectAtom(
    liveTileMetricsAtom,
    (m): TileRowMetrics | undefined => (m ? getTileRow(m, idx) : undefined),
    isEqual,
  ),
);

export const tileTimerValueAtomFamily = atomFamily((idx: number) =>
  atom((get) => get(tileTimerAtom)?.[idx]),
);

export const hasLiveTileMetricsAtom = atom((get) => !!get(liveTileMetricsAtom));

export const tilePriorityCountsAtom = selectAtom(
  liveTileMetricsAtom,
  (m) => (m ? { priority: m.priority, alive: m.alive } : undefined),
  isEqual,
);
