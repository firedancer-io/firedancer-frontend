import { describe, expect, it } from "vitest";
import { CertKind } from "./consts";
import { getSlotLatencies, getSlotStartTs } from "./latency";
import type { SlotVotes } from "./votesData";

const empty = { ts: [], frac: [] };

function slot(
  certs: [CertKind, number][],
  parentReadyTs?: number,
): Omit<SlotVotes, "slot"> {
  return {
    notar: empty,
    notarFallback: null,
    finalize: empty,
    skip: empty,
    certs: new Map(certs),
    ownVotes: new Map(),
    parentReadyTs,
    rewardAckTs: undefined,
  };
}

function slotMap(entries: [number, Omit<SlotVotes, "slot">][]) {
  return new Map(entries.map(([slot, votes]) => [slot, { ...votes, slot }]));
}

describe("getSlotLatencies", () => {
  it("measures from the window's parent ready plus the slot offset", () => {
    const latencies = getSlotLatencies(
      slotMap([
        [8, slot([[CertKind.Notar, 150]], 100)],
        [10, slot([[CertKind.Notar, 600]])],
      ]),
      200,
    );
    // slot 8 starts at 100, slot 10 at 100 + 2 * 200
    expect(latencies.notarized).toEqual([
      { slot: 8, ts: 150, latencyMs: 50 },
      { slot: 10, ts: 600, latencyMs: 100 },
    ]);
  });

  it("uses the first of notar and fast finalize for notarized", () => {
    const latencies = getSlotLatencies(
      slotMap([
        [
          8,
          slot(
            [
              [CertKind.Notar, 160],
              [CertKind.FastFinalize, 150],
            ],
            100,
          ),
        ],
      ]),
      200,
    );
    expect(latencies.notarized[0].latencyMs).toBe(50);
    expect(latencies.fast[0].latencyMs).toBe(50);
  });

  it("uses the notarization for slow finalization when it came later", () => {
    const latencies = getSlotLatencies(
      slotMap([
        [
          8,
          slot(
            [
              [CertKind.Finalize, 150],
              [CertKind.Notar, 180],
            ],
            100,
          ),
        ],
        [
          12,
          slot(
            [
              [CertKind.Notar, 120],
              [CertKind.Finalize, 170],
            ],
            100,
          ),
        ],
      ]),
      200,
    );
    expect(latencies.slow).toEqual([
      { slot: 12, ts: 170, latencyMs: 70 },
      { slot: 8, ts: 180, latencyMs: 80 },
    ]);
  });

  it("skips slots whose window has no parent ready", () => {
    const latencies = getSlotLatencies(
      slotMap([[8, slot([[CertKind.Notar, 150]])]]),
      200,
    );
    expect(latencies.notarized).toEqual([]);
  });
});

describe("getSlotStartTs", () => {
  // window 8-11 became ParentReady at 1000
  const slotVotes = slotMap([
    [8, slot([], 1000)],
    [10, slot([])],
  ]);

  it("adds the slot's offset in the window to the window's ParentReady", () => {
    expect(getSlotStartTs(slotVotes, 8, 200)).toBe(1000);
    expect(getSlotStartTs(slotVotes, 10, 200)).toBe(1400);
    expect(getSlotStartTs(slotVotes, 11, 200)).toBe(1600);
  });

  it("is undefined without the window's ParentReady", () => {
    expect(getSlotStartTs(slotVotes, 12, 200)).toBeUndefined();
  });
});
