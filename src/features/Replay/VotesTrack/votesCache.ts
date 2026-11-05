import { getDefaultStore } from "jotai";
import type { TimelineVotes, VotesGranularity } from "../../../api/types";
import { VotesGranularityEnum } from "../../../api/entities";
import { sendMessage } from "../../../api/worker/useWsWorker";
import {
  createTileCache,
  type Tile,
  type TileCache,
  type TileCacheDelta,
} from "../tiles/cache";
import { createPendingRequests } from "../tiles/requests";
import type { Interval } from "../tiles/splitFetch";
import { referenceNsAtom } from "../atoms";
import type { NsTsRange } from "../../WebGl/webglUtils";
import { bigIntMax, bigIntMin } from "../../../mathUtils";
import {
  countPoints,
  mergeVotesData,
  parseVotes,
  type VotesData,
} from "./votesData";

const store = getDefaultStore();

export const votesRequests = createPendingRequests<TimelineVotes>();

const emptyVotes = (): VotesData => new Map();

export type VotesCacheDelta = TileCacheDelta<VotesData, null>;

const TILE_NS: Record<VotesGranularity, bigint> = {
  vote: 4_000_000_000n, // 4s
  vote_batch: 32_000_000_000n, // 32s
};

function fetchVotes(granularity: VotesGranularity) {
  return async ([start, end]: Interval, id: number) => {
    sendMessage({
      topic: "timeline",
      key: "query_votes",
      id,
      params: {
        start_ns: start.toString(),
        // end_ns is exclusive so +1n includes items at end
        end_ns: (end + 1n).toString(),
        granularity,
      },
    });
    const result = await votesRequests.awaitResponse(id);
    if (!("value" in result)) return result;

    const referenceNs = store.get(referenceNsAtom);
    return {
      value:
        referenceNs == null
          ? emptyVotes()
          : parseVotes(result.value, referenceNs),
      availableEndNs: result.value.available_end_ns,
    };
  };
}

function createCache(granularity: VotesGranularity) {
  return createTileCache<VotesData, null>({
    tileNs: TILE_NS[granularity],
    minSubTileNs: 1_000_000n, // 1ms
    maxItems: 2_000_000,
    maxTiles: 64,
    empty: emptyVotes,
    merge: mergeVotesData,
    itemCount: countPoints,
    deriveMeta: () => null,
    fetch: fetchVotes(granularity),
    // batches of recent slots are re-simplified per query, so they don't sum
    fetchLive: fetchVotes(VotesGranularityEnum.vote),
    failPendingRequests: votesRequests.failAll,
  });
}

export const votesCaches: Record<
  VotesGranularity,
  TileCache<VotesData, null>
> = {
  vote: createCache(VotesGranularityEnum.vote),
  vote_batch: createCache(VotesGranularityEnum.vote_batch),
};

/**
 * Batch tiles span whole vote tiles, so fallbacks are chosen per batch tile
 * sized region. Votes data can't be clipped to a sub tile window.
 */
export const VOTES_REGION_NS = TILE_NS.vote_batch;

function getOtherGranularity(granularity: VotesGranularity) {
  return granularity === VotesGranularityEnum.vote
    ? VotesGranularityEnum.vote_batch
    : VotesGranularityEnum.vote;
}

/**
 * Call `fn` with each region overlapping in-world [startNs, endNs), clipped
 * to it, since tiles outside the world are never fetched
 */
function forEachRegion(
  [startNs, endNs]: NsTsRange,
  fn: (regionStartNs: bigint, clippedNs: NsTsRange) => void,
) {
  for (
    let regionStartNs = (startNs / VOTES_REGION_NS) * VOTES_REGION_NS;
    regionStartNs < endNs;
    regionStartNs += VOTES_REGION_NS
  ) {
    fn(regionStartNs, [
      bigIntMax(regionStartNs, startNs),
      bigIntMin(regionStartNs + VOTES_REGION_NS, endNs),
    ]);
  }
}

/**
 * Whether every region in in-world [startNs, endNs) has loaded in either
 * granularity, since drawing falls back to the other granularity
 */
export function isVotesRangeDrawable(
  granularity: VotesGranularity,
  rangeNs: NsTsRange,
) {
  const fallbackCache = votesCaches[getOtherGranularity(granularity)];
  let isDrawable = true;
  forEachRegion(rangeNs, (_, clippedNs) => {
    if (
      !votesCaches[granularity].isRangeFetched(clippedNs) &&
      !fallbackCache.isRangeFetched(clippedNs)
    ) {
      isDrawable = false;
    }
  });
  return isDrawable;
}

/**
 * Other granularity tiles to draw in place of regions in in-world
 * [startNs, endNs) that haven't loaded in `granularity`, and the start of
 * each region they replace
 */
export function getFallbackVotesTiles(
  granularity: VotesGranularity,
  rangeNs: NsTsRange,
): { regionStartsNs: Set<bigint>; tiles: Tile<VotesData, null>[] } {
  const fallbackGranularity = getOtherGranularity(granularity);
  const fallbackCache = votesCaches[fallbackGranularity];
  const fallbackTileNs = TILE_NS[fallbackGranularity];

  const regionStartsNs = new Set<bigint>();
  const tiles: Tile<VotesData, null>[] = [];
  forEachRegion(rangeNs, (regionStartNs, [startNs, endNs]) => {
    if (
      votesCaches[granularity].isRangeFetched([startNs, endNs]) ||
      !fallbackCache.isRangeFetched([startNs, endNs])
    ) {
      return;
    }

    regionStartsNs.add(regionStartNs);
    for (
      let ns = (startNs / fallbackTileNs) * fallbackTileNs;
      ns < endNs;
      ns += fallbackTileNs
    ) {
      const tile = fallbackCache.getTile(ns);
      if (tile) tiles.push(tile);
    }
  });
  return { regionStartsNs, tiles };
}
