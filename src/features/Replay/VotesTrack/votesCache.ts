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
import { referenceNsAtom } from "../atoms";
import { VOTES_TILE_NS } from "./consts";
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
