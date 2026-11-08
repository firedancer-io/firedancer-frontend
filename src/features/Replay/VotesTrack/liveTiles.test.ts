import { describe, expect, it } from "vitest";
import { applyVotesDelta, type LiveTiles } from "./liveTiles";
import type { VotesData } from "./votesData";

function cacheTile(startNs: bigint) {
  return {
    startNs,
    endNs: startNs + 4n,
    data: new Map() as VotesData,
    meta: null,
  };
}

describe("applyVotesDelta", () => {
  it("tracks the live tile per granularity and reports what changed", () => {
    const liveTiles: LiveTiles = { vote: null, vote_batch: null };
    const live = cacheTile(8n);
    expect(
      applyVotesDelta(liveTiles, "vote", {
        kind: "live",
        tile: live,
        newData: new Map(),
        isNewTile: true,
      }),
    ).toEqual([8n]);
    expect(liveTiles).toEqual({ vote: live, vote_batch: null });

    expect(
      applyVotesDelta(liveTiles, "vote", {
        kind: "add",
        tiles: [cacheTile(0n)],
      }),
    ).toEqual([0n]);
    expect(liveTiles.vote).toBe(live);

    // the live tile settled
    expect(
      applyVotesDelta(liveTiles, "vote", {
        kind: "add",
        tiles: [cacheTile(8n)],
      }),
    ).toEqual([8n]);
    expect(liveTiles.vote).toBeNull();
  });

  it("drops the live tile on clearLive and reset", () => {
    for (const kind of ["clearLive", "reset"] as const) {
      const liveTiles: LiveTiles = { vote: cacheTile(8n), vote_batch: null };
      expect(applyVotesDelta(liveTiles, "vote", { kind })).toEqual([]);
      expect(liveTiles.vote).toBeNull();
    }
  });
});
