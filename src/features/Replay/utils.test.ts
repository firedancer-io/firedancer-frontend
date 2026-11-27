import { describe, it, expect } from "vitest";
import { getStableDataNs } from "./utils";

const chunk = (chunkTsMs: number, chunkDurMs: number) => ({
  chunk_ts: BigInt(chunkTsMs) * 1_000_000n,
  chunk_dur: BigInt(chunkDurMs) * 1_000_000n,
});

describe("getStableDataNs", () => {
  it("ends at the server's data end when a chunk spans past it", () => {
    expect(getStableDataNs([chunk(0, 3_000)], 1_000_000_000n)).toBe(
      1_000_000_000n,
    );
  });

  it("ends at the last chunk without a server data end", () => {
    expect(getStableDataNs([chunk(0, 100), chunk(100, 100)], null)).toBe(
      200_000_000n,
    );
  });

  it("uses the server's data end for an empty reply", () => {
    expect(getStableDataNs([], 1_000_000_000n)).toBe(1_000_000_000n);
    expect(getStableDataNs([], null)).toBeNull();
  });
});
