import { atom } from "jotai";
import { startupTimeBaseAtom } from "../../api/atoms";
import type { StartupTimeNanos } from "../../api/types";
import {
  clearSelectedSlotAtom,
  dismissPinnedAtom,
  hoveredAggCpuAtom,
  hoveredAggRevenueAtom,
  hoveredAggShredsAtom,
  hoveredExecrpTxnAtom,
  hoveredRevenueTxnAtom,
  hoveredShredAtom,
  resetHoverInfoAtom,
  restartPlaybackAtom,
} from "./atoms";
import { clearAggSlotsAtom } from "./HeaderTrack/aggAtoms";
import { clearTimelineSlotsAtom } from "./HeaderTrack/nonAggAtoms";
import {
  clearAggShredsAtom,
  timelineFecShredsAtoms,
  timelineShredsAtoms,
} from "./ShredsTrack/atoms";
import { clearAggRevenueAtom } from "./RevenueTrack/atoms";
import { txnMetaCache } from "./RevenueTrack/txnMeta/txnMetaCache";
import { clearAggCpuAtom } from "./CpuTrack/atoms";
import { clearAggTileStatesAtom } from "./tileStates/aggAtoms";
import { tileStatesCaches } from "./tileStates/tileStatesCache";
import { clearAggVotesAtom } from "./VotesTrack/aggAtoms";
import { votesCaches } from "./VotesTrack/votesCache";
import { eventsByTypeFamily, timelineEventTypes } from "./Events/atoms";
import { clearAllTileQueryStateAtom } from "./parallelQueriesCache";

const clearReplayDataAtom = atom(null, (_get, set) => {
  for (const cache of Object.values(tileStatesCaches)) cache.reset();
  for (const cache of Object.values(votesCaches)) cache.reset();
  txnMetaCache.reset();
  set(clearAllTileQueryStateAtom);

  set(clearAggSlotsAtom);
  set(clearAggShredsAtom);
  set(clearAggRevenueAtom);
  set(clearAggCpuAtom);
  set(clearAggTileStatesAtom);
  set(clearAggVotesAtom);

  set(clearTimelineSlotsAtom);
  set(timelineShredsAtoms.clear);
  set(timelineFecShredsAtoms.clear);
  for (const type of timelineEventTypes) set(eventsByTypeFamily(type), []);

  set(dismissPinnedAtom);
  set(clearSelectedSlotAtom);
  set(resetHoverInfoAtom);
  set(hoveredShredAtom, undefined);
  set(hoveredExecrpTxnAtom, undefined);
  set(hoveredAggShredsAtom, undefined);
  set(hoveredAggRevenueAtom, undefined);
  set(hoveredAggCpuAtom, undefined);
  set(hoveredRevenueTxnAtom, undefined);
});

export const setStartupTimeAtom = atom(
  null,
  (get, set, startupTimeNanos: StartupTimeNanos) => {
    const prevNanos = get(startupTimeBaseAtom)?.startupTimeNanos;
    const isRestart = prevNanos !== undefined && prevNanos !== startupTimeNanos;

    if (isRestart) set(clearReplayDataAtom);
    set(startupTimeBaseAtom, { startupTimeNanos });
    // the live range is computed from the new startup time
    if (isRestart) set(restartPlaybackAtom);
  },
);
