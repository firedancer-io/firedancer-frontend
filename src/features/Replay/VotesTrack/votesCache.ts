import { getDefaultStore } from "jotai";
import type { TimelineVotes, VotesGranularity } from "../../../api/types";
import { VotesGranularityEnum } from "../../../api/entities";
import { sendMessage } from "../../../api/worker/useWsWorker";
import {
  createTileCache,
  type TileCache,
  type TileCacheDelta,
} from "../tiles/cache";
import { createPendingRequests } from "../tiles/requests";
import type { Interval } from "../tiles/splitFetch";
import { referenceNsAtom, visibleRangeAtom } from "../atoms";
import { calcAbsoluteNs, calcRelativeMs } from "../utils";
import { bigIntMax, bigIntMin } from "../../../mathUtils";
import { OVERSCAN_DRAW_TILES_COUNT } from "../HeaderTrack/useNonAggHeaderQuery";
import type { DataLevel } from "../coverage";
import type { NsTsRange } from "../../WebGl/webglUtils";
import { VOTES_TILE_NS } from "./consts";
import {
  clipVotesData,
  countPoints,
  mergeVotesData,
  parseVotes,
  type VotesData,
  type VotesDataTile,
} from "./votesData";

const store = getDefaultStore();

export const votesRequests = createPendingRequests<TimelineVotes>();

const emptyVotes = (): VotesData => new Map();

export type VotesCacheDelta = TileCacheDelta<VotesData, null>;

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
      // not chunked, so the server's newest retained vote bounds what was fetched
      chunksEndNs: result.value.available_end_ns ?? end + 1n,
    };
  };
}

function createCache(granularity: VotesGranularity) {
  return createTileCache<VotesData, null>({
    tileNs: VOTES_TILE_NS[granularity],
    minSubTileNs: 1_000_000n, // 1ms
    maxItems: 2_000_000,
    maxTiles: 64,
    empty: emptyVotes,
    merge: mergeVotesData,
    itemCount: countPoints,
    deriveMeta: () => null,
    fetch: fetchVotes(granularity),
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

export const hasFallbackData: Record<
  VotesGranularity,
  (tileRangeNs: NsTsRange) => boolean
> = {
  vote: (tileRangeNs) => votesCaches.vote_batch.isRangeFetched(tileRangeNs),
  vote_batch: (tileRangeNs) => {
    for (
      let voteStartNs =
        (tileRangeNs[0] / VOTES_TILE_NS.vote) * VOTES_TILE_NS.vote;
      voteStartNs < tileRangeNs[1];
      voteStartNs += VOTES_TILE_NS.vote
    ) {
      const voteRangeNs: NsTsRange = [
        voteStartNs,
        voteStartNs + VOTES_TILE_NS.vote,
      ];
      if (votesCaches.vote.isRangeFetched(voteRangeNs)) return true;
    }
    return false;
  },
};

const clippedBatchData = new WeakMap<VotesData, Map<bigint, VotesData>>();

function getClippedBatchData(
  batchData: VotesData,
  referenceNs: bigint,
  startNs: bigint,
) {
  let byStartNs = clippedBatchData.get(batchData);
  if (!byStartNs) {
    byStartNs = new Map();
    clippedBatchData.set(batchData, byStartNs);
  }
  let clipped = byStartNs.get(startNs);
  if (!clipped) {
    clipped = clipVotesData(
      batchData,
      calcRelativeMs(referenceNs, startNs),
      calcRelativeMs(referenceNs, startNs + VOTES_TILE_NS.vote),
    );
    byStartNs.set(startNs, clipped);
  }
  return clipped;
}

/**
 * The visible data tiles' range with overscan, which fallback data tiles are
 * drawn in
 */
export function getFallbackRangeNs(
  granularity: VotesGranularity,
): NsTsRange | undefined {
  const referenceNs = store.get(referenceNsAtom);
  const visibleRange = store.get(visibleRangeAtom);
  if (referenceNs == null || !visibleRange) return;

  const tileNs = VOTES_TILE_NS[granularity];
  const overscan = BigInt(OVERSCAN_DRAW_TILES_COUNT);
  return [
    (calcAbsoluteNs(referenceNs, visibleRange[0]) / tileNs - overscan) * tileNs,
    (calcAbsoluteNs(referenceNs, visibleRange[1]) / tileNs + overscan + 1n) *
      tileNs,
  ];
}

export function getFallbackDataTiles(
  granularity: VotesGranularity,
  [startNs, endNs]: NsTsRange,
): VotesDataTile[] {
  const cache = votesCaches[granularity];
  if (granularity === VotesGranularityEnum.vote_batch) {
    // vote data tiles in uncached batch data tiles
    return votesCaches.vote
      .getTiles()
      .filter(
        (tile) =>
          startNs <= tile.startNs &&
          tile.startNs < endNs &&
          !cache.getTile(tile.startNs),
      );
  }

  // batch data tiles clipped to their uncached vote data tiles
  const referenceNs = store.get(referenceNsAtom);
  if (referenceNs == null) return [];
  const fallbacks: VotesDataTile[] = [];
  for (
    let voteStartNs = startNs;
    voteStartNs < endNs;
    voteStartNs += VOTES_TILE_NS.vote
  ) {
    if (cache.getTile(voteStartNs)) continue;
    const batchTile = votesCaches.vote_batch.getTile(voteStartNs);
    if (!batchTile || batchTile.isLive) continue;
    fallbacks.push({
      startNs: voteStartNs,
      data: getClippedBatchData(batchTile.data, referenceNs, voteStartNs),
    });
  }
  return fallbacks;
}

export const slotVotesLevel: DataLevel = {
  id: "slot",
  isAgg: false,
  tileSizeNs: VOTES_TILE_NS.vote_batch,
  isRangeFetched: (rangeNs) => {
    for (
      let voteStartNs = (rangeNs[0] / VOTES_TILE_NS.vote) * VOTES_TILE_NS.vote;
      voteStartNs < rangeNs[1];
      voteStartNs += VOTES_TILE_NS.vote
    ) {
      const voteRangeNs: NsTsRange = [
        voteStartNs,
        voteStartNs + VOTES_TILE_NS.vote,
      ];
      if (
        !votesCaches.vote.isRangeFetched(voteRangeNs) &&
        !votesCaches.vote_batch.isRangeFetched(voteRangeNs)
      ) {
        return false;
      }
    }
    return true;
  },
};

/**
 * Whether the range's slot votes have loaded, except before the server's
 * retention start, which has none to load
 */
export function isSlotVotesRangeLoaded(rangeNs: NsTsRange): boolean {
  const [first, ...rest] = [
    votesCaches.vote.getAvailableStartNs(),
    votesCaches.vote_batch.getAvailableStartNs(),
  ].filter((ns) => ns !== undefined);
  const startNs =
    first === undefined
      ? rangeNs[0]
      : bigIntMax(rangeNs[0], bigIntMin(first, ...rest));
  return (
    startNs >= rangeNs[1] ||
    slotVotesLevel.isRangeFetched([startNs, rangeNs[1]])
  );
}
