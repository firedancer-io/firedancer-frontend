import type { VotesGranularity } from "../../../api/types";
import type { VotesCacheDelta } from "./votesCache";
import type { VotesDataTile } from "./votesData";

export type LiveTiles = Record<VotesGranularity, VotesDataTile | null>;

// tracks the live tile and returns the start of each tile whose data changed
export function applyVotesDelta(
  liveTiles: LiveTiles,
  granularity: VotesGranularity,
  delta: VotesCacheDelta,
): bigint[] {
  const live = liveTiles[granularity];
  switch (delta.kind) {
    case "live":
      liveTiles[granularity] = delta.tile;
      return [delta.tile.startNs];
    case "add":
      if (live && delta.tiles.some((t) => t.startNs === live.startNs)) {
        liveTiles[granularity] = null;
      }
      return delta.tiles.map(({ startNs }) => startNs);
    case "clearLive":
    case "reset":
      liveTiles[granularity] = null;
      return [];
  }
}
