import { describe, expect, it } from "vitest";
import type { TimelineVotes } from "../../../api/types";
import { nsPerMs } from "../../../consts";
import { CertKind, PARENT_READY_EVENT, VoteKind } from "./consts";
import {
  buildSlotVotes,
  countPoints,
  getLineFadeTs,
  getSlotOutcome,
  hasVotesWithoutTotalStake,
  mergeVotesData,
  parseVotes,
  sumCurves,
} from "./votesData";

const referenceNs = 1_000_000_000_000n;

interface Row {
  slot: number;
  event: number;
  ms: number;
  stake?: number;
}

function response(
  rows: Row[],
  totalStake = 1000,
  nextEpoch?: { startSlot: number; totalStake: number },
): TimelineVotes {
  if (!rows.length) {
    return {
      granularity: "vote",
      available_start_ns: null,
      available_end_ns: null,
      reference_slot: null,
      reference_ts: null,
      slot_delta: [],
      event: [],
      event_ts_delta: [],
      stake: [],
      total_stake: null,
      next_epoch_start_slot: null,
      next_total_stake: null,
    };
  }
  const referenceSlot = Math.min(...rows.map((r) => r.slot));
  const referenceTs = referenceNs + BigInt(rows[0].ms * nsPerMs);
  return {
    granularity: "vote",
    available_start_ns: null,
    available_end_ns: null,
    reference_slot: referenceSlot,
    reference_ts: referenceTs,
    slot_delta: rows.map((r) => r.slot - referenceSlot),
    event: rows.map((r) => r.event),
    event_ts_delta: rows.map(
      (r) => referenceNs + BigInt(r.ms * nsPerMs) - referenceTs,
    ),
    stake: rows.map((r) => (r.stake == null ? null : BigInt(r.stake))),
    total_stake: BigInt(totalStake),
    next_epoch_start_slot: nextEpoch?.startSlot ?? null,
    next_total_stake: nextEpoch == null ? null : BigInt(nextEpoch.totalStake),
  };
}

function expectCurve(
  actual: { ts: number[]; frac: number[] } | undefined,
  expected: { ts: number[]; frac: number[] },
) {
  expect(actual?.ts).toEqual(expected.ts);
  expect(actual?.frac).toHaveLength(expected.frac.length);
  expected.frac.forEach((frac, i) => expect(actual?.frac[i]).toBeCloseTo(frac));
}

function vote(slot: number, kind: VoteKind, ms: number, stake: number): Row {
  return { slot, event: kind, ms, stake };
}

describe("parseVotes", () => {
  it("accumulates stake fractions per slot and kind", () => {
    const data = parseVotes(
      response([
        vote(10, VoteKind.Notar, 1, 100),
        vote(10, VoteKind.Skip, 2, 50),
        vote(10, VoteKind.Notar, 3, 200),
        vote(11, VoteKind.Notar, 4, 400),
      ]),
      referenceNs,
    );

    expect(data.get(10)?.curves[VoteKind.Notar]).toEqual({
      ts: [1, 3],
      frac: [0.1, 0.3],
    });
    expect(data.get(10)?.curves[VoteKind.Skip]).toEqual({
      ts: [2],
      frac: [0.05],
    });
    expect(data.get(11)?.curves[VoteKind.Notar]).toEqual({
      ts: [4],
      frac: [0.4],
    });
  });

  it("drops steps smaller than the min step but keeps the final point", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      vote(10, VoteKind.Notar, i, 1),
    );
    const curve = parseVotes(response(rows, 10_000), referenceNs).get(10)
      ?.curves[VoteKind.Notar];

    // each vote is 0.0001; a point is kept every 0.002 or at the end
    expect(curve?.ts).toEqual([9]);
    expect(curve?.frac[0]).toBeCloseTo(0.001);
  });

  it("uses next epoch total stake for slots in the next epoch", () => {
    const data = parseVotes(
      response(
        [vote(10, VoteKind.Notar, 1, 100), vote(20, VoteKind.Notar, 2, 100)],
        1000,
        { startSlot: 20, totalStake: 500 },
      ),
      referenceNs,
    );

    expect(data.get(10)?.curves[VoteKind.Notar].frac).toEqual([0.1]);
    expect(data.get(20)?.curves[VoteKind.Notar].frac).toEqual([0.2]);
  });

  it("keeps the earliest certificate per kind and ignores other events", () => {
    const data = parseVotes(
      response([
        { slot: 10, event: CertKind.Notar, ms: 5 },
        { slot: 10, event: CertKind.Notar, ms: 7 },
        { slot: 10, event: CertKind.FastFinalize, ms: 9 },
        { slot: 10, event: 12, ms: 10 },
        { slot: 10, event: 20, ms: 11 },
      ]),
      referenceNs,
    );

    expect(data.get(10)?.certs).toEqual(
      new Map([
        [CertKind.Notar, 5],
        [CertKind.FastFinalize, 9],
      ]),
    );
  });

  it("returns no slots for an empty response", () => {
    expect(parseVotes(response([]), referenceNs).size).toBe(0);
  });
});

describe("parseVotes vote_batch", () => {
  const batch = (rows: Row[]): TimelineVotes => ({
    ...response(rows),
    granularity: "vote_batch",
  });

  it("maps batch rows onto vote kinds and keeps every breakpoint", () => {
    const data = parseVotes(
      batch([
        { slot: 10, event: 21 + VoteKind.Notar, ms: 1, stake: 500 },
        { slot: 10, event: 21 + VoteKind.Notar, ms: 2, stake: 1 },
        { slot: 10, event: 21 + VoteKind.Finalize, ms: 3, stake: 600 },
        { slot: 10, event: CertKind.Notar, ms: 2 },
      ]),
      referenceNs,
    );

    expectCurve(data.get(10)?.curves[VoteKind.Notar], {
      ts: [1, 2],
      frac: [0.5, 0.501],
    });
    expectCurve(data.get(10)?.curves[VoteKind.Finalize], {
      ts: [3],
      frac: [0.6],
    });
    expect(data.get(10)?.certs.get(CertKind.Notar)).toBe(2);
  });
});

describe("parseVotes parent ready", () => {
  it("keeps the earliest parent ready per window start slot", () => {
    const tileA = parseVotes(
      response([{ slot: 8, event: PARENT_READY_EVENT, ms: 5 }]),
      referenceNs,
    );
    const tileB = parseVotes(
      response([{ slot: 8, event: PARENT_READY_EVENT, ms: 3 }]),
      referenceNs,
    );
    expect(buildSlotVotes([tileA, tileB]).get(8)?.parentReadyTs).toBe(3);
  });
});

describe("sumCurves", () => {
  it("sums step functions at every point of either curve", () => {
    expectCurve(
      sumCurves(
        { ts: [1, 4], frac: [0.1, 0.3] },
        { ts: [2, 4, 6], frac: [0.2, 0.25, 0.5] },
      ),
      { ts: [1, 2, 4, 6], frac: [0.1, 0.3, 0.55, 0.8] },
    );
  });

  it("returns the other curve when one is empty", () => {
    const curve = { ts: [1], frac: [0.5] };
    expect(sumCurves({ ts: [], frac: [] }, curve)).toEqual(curve);
    expect(sumCurves(curve, { ts: [], frac: [] })).toEqual(curve);
  });
});

describe("mergeVotesData", () => {
  it("matches parsing all rows at once", () => {
    const first = [
      vote(10, VoteKind.Notar, 1, 100),
      { slot: 10, event: CertKind.Skip, ms: 3 },
    ];
    const second = [
      vote(10, VoteKind.Notar, 4, 300),
      vote(11, VoteKind.Skip, 5, 50),
      { slot: 10, event: CertKind.Skip, ms: 2 },
    ];

    const acc = parseVotes(response(first), referenceNs);
    mergeVotesData(acc, parseVotes(response(second), referenceNs));

    expectCurve(acc.get(10)?.curves[VoteKind.Notar], {
      ts: [1, 4],
      frac: [0.1, 0.4],
    });
    expect(acc.get(10)?.certs.get(CertKind.Skip)).toBe(2);
    expect(acc.get(11)?.curves[VoteKind.Skip].frac).toEqual([0.05]);
    expect(countPoints(acc)).toBe(3);
  });
});

describe("buildSlotVotes", () => {
  it("combines tiles and derives finalize and skip curves", () => {
    const tileA = parseVotes(
      response([
        vote(10, VoteKind.Notar, 1, 100),
        vote(10, VoteKind.Skip, 1, 100),
      ]),
      referenceNs,
    );
    const tileB = parseVotes(
      response([
        vote(10, VoteKind.Notar, 2, 300),
        vote(10, VoteKind.Finalize, 3, 600),
        vote(10, VoteKind.SkipFallback, 3, 200),
        { slot: 10, event: CertKind.Finalize, ms: 3 },
      ]),
      referenceNs,
    );

    const slot = buildSlotVotes([tileA, tileB]).get(10);
    expectCurve(slot?.notar, { ts: [1, 2], frac: [0.1, 0.4] });
    expectCurve(slot?.finalize, { ts: [3], frac: [0.6] });
    expectCurve(slot?.skipAll, { ts: [1, 3], frac: [0.1, 0.3] });
    expect(slot?.certs.get(CertKind.Finalize)).toBe(3);
  });
});

describe("buildSlotVotes notar fallback", () => {
  it("adds notar and notar fallback stake when fallback votes exist", () => {
    const data = parseVotes(
      response([
        vote(10, VoteKind.Notar, 1, 100),
        vote(10, VoteKind.NotarFallback, 2, 300),
        vote(10, VoteKind.Notar, 3, 200),
      ]),
      referenceNs,
    );

    const slot = buildSlotVotes([data]).get(10);
    expectCurve(slot?.notar, { ts: [1, 3], frac: [0.1, 0.3] });
    expectCurve(slot?.notarFallback ?? undefined, {
      ts: [1, 2, 3],
      frac: [0.1, 0.4, 0.6],
    });
  });

  it("omits the notar fallback line without fallback votes", () => {
    const data = parseVotes(
      response([vote(10, VoteKind.Notar, 1, 100)]),
      referenceNs,
    );
    expect(buildSlotVotes([data]).get(10)?.notarFallback).toBeNull();
  });
});

describe("getSlotOutcome", () => {
  const certs = (...kinds: CertKind[]) =>
    new Map(kinds.map((kind) => [kind, 0]));

  it.each([
    [certs(CertKind.FastFinalize), true, "skipped"],
    [certs(CertKind.Skip), false, "skipped"],
    [certs(CertKind.Notar, CertKind.FastFinalize), false, "fast"],
    [certs(CertKind.FastFinalize, CertKind.Finalize), false, "fast"],
    [certs(CertKind.Notar, CertKind.Finalize), false, "slow"],
    [certs(CertKind.Notar), false, "implicit"],
    [certs(CertKind.NotarFallback, CertKind.Skip), false, "implicit"],
    [certs(), false, "implicit"],
    [undefined, false, "implicit"],
  ] as const)("%o skipped=%s -> %s", (certMap, isSkipped, expected) => {
    expect(getSlotOutcome(certMap, isSkipped)).toBe(expected);
  });
});

describe("hasVotesWithoutTotalStake", () => {
  it("only flags responses with vote rows", () => {
    const certsOnly = {
      ...response([{ slot: 10, event: CertKind.FastFinalize, ms: 1 }]),
      total_stake: null,
    };
    expect(hasVotesWithoutTotalStake(certsOnly)).toBe(false);

    const votes = response([vote(10, VoteKind.Notar, 1, 100)]);
    expect(hasVotesWithoutTotalStake(votes)).toBe(false);
    expect(hasVotesWithoutTotalStake({ ...votes, total_stake: null })).toBe(
      true,
    );

    const batches = {
      ...response([{ slot: 10, event: 21, ms: 1, stake: 100 }]),
      total_stake: null,
    };
    expect(hasVotesWithoutTotalStake(batches)).toBe(true);
  });
});

describe("getLineFadeTs", () => {
  const certs = new Map([
    [CertKind.Notar, 50],
    [CertKind.FastFinalize, 70],
    [CertKind.Finalize, 110],
  ]);

  it("fades each line after its own last certificate", () => {
    expect(getLineFadeTs("notar", certs)).toBe(70);
    expect(getLineFadeTs("finalize", certs)).toBe(110);
  });

  it("uses the notar certificate when the slot never fast finalized", () => {
    expect(getLineFadeTs("notar", new Map([[CertKind.Notar, 50]]))).toBe(50);
  });

  it("doesn't fade a line without a certificate", () => {
    expect(getLineFadeTs("skip", certs)).toBeUndefined();
  });
});
