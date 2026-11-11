import { describe, expect, it } from "vitest";
import type { TimelineVotes } from "../../../api/types";
import { timelineVotesSchema } from "../../../api/entities";
import { nsPerMs } from "../../../consts";
import {
  CertKind,
  MIN_STEP_FRAC,
  OWN_VOTE_EVENT_OFFSET,
  PARENT_READY_EVENT,
  VOTE_BATCH_EVENT_OFFSET,
  VoteKind,
} from "./consts";
import {
  buildSlotVotes,
  clipVotesData,
  countPoints,
  getFadeTs,
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
  // the server's running total when the slot started before the window
  cumulativeStake?: number | null;
}

// like the server: each vote row carries its slot's running total per kind
function getCumulativeStakes(rows: Row[]) {
  const totals = new Map<string, number>();
  return rows.map(({ slot, event, stake, cumulativeStake }) => {
    if (cumulativeStake !== undefined) {
      return cumulativeStake === null ? null : String(cumulativeStake);
    }
    if (stake == null) return null;
    const key = `${slot}:${event % 21}`;
    const total = (totals.get(key) ?? 0) + stake;
    totals.set(key, total);
    return String(total);
  });
}

function response(
  rows: Row[],
  totalStake = 1000,
  nextEpoch?: { startSlot: number; totalStake: number },
): TimelineVotes {
  if (!rows.length) {
    return timelineVotesSchema.parse({
      granularity: "vote",
      available_start_ns: null,
      available_end_ns: null,
      reference_slot: null,
      reference_ts: null,
      slot_delta: [],
      event: [],
      event_ts_delta: [],
      cumulative_stake: [],
      total_stake: null,
      next_epoch_start_slot: null,
      next_total_stake: null,
    });
  }
  const referenceSlot = Math.min(...rows.map((r) => r.slot));
  const referenceTs = referenceNs + BigInt(rows[0].ms * nsPerMs);
  return timelineVotesSchema.parse({
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
    cumulative_stake: getCumulativeStakes(rows),
    total_stake: BigInt(totalStake),
    next_epoch_start_slot: nextEpoch?.startSlot ?? null,
    next_total_stake: nextEpoch == null ? null : BigInt(nextEpoch.totalStake),
  });
}

// one window's rows per response, with totals running across windows
function splitResponses(windows: Row[][]) {
  const cumulativeStakes = getCumulativeStakes(windows.flat());
  let i = 0;
  return windows.map((rows) =>
    response(
      rows.map((row) => {
        const cumulativeStake = cumulativeStakes[i++];
        return {
          ...row,
          cumulativeStake:
            cumulativeStake === null ? null : Number(cumulativeStake),
        };
      }),
    ),
  );
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

describe("parseVotes own votes", () => {
  it("keeps when this validator cast each vote kind, across tiles", () => {
    const tileA = parseVotes(
      response([
        { slot: 10, event: OWN_VOTE_EVENT_OFFSET + VoteKind.Notar, ms: 5 },
        { slot: 10, event: OWN_VOTE_EVENT_OFFSET + VoteKind.Finalize, ms: 9 },
      ]),
      referenceNs,
    );
    const tileB = parseVotes(
      response([
        { slot: 10, event: OWN_VOTE_EVENT_OFFSET + VoteKind.Notar, ms: 4 },
      ]),
      referenceNs,
    );

    expect(buildSlotVotes([tileA, tileB]).get(10)?.ownVotes).toEqual(
      new Map([
        [VoteKind.Notar, 4],
        [VoteKind.Finalize, 9],
      ]),
    );
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

    const [firstRes, secondRes] = splitResponses([first, second]);
    const acc = parseVotes(firstRes, referenceNs);
    mergeVotesData(acc, parseVotes(secondRes, referenceNs));

    expectCurve(acc.get(10)?.curves[VoteKind.Notar], {
      ts: [1, 4],
      frac: [0.1, 0.4],
    });
    expect(acc.get(10)?.certs.get(CertKind.Skip)).toBe(2);
    expect(acc.get(11)?.curves[VoteKind.Skip].frac).toEqual([0.05]);
    expect(countPoints(acc)).toBe(3);
  });
});

describe("parseVotes cumulative stake", () => {
  it("starts a slot that began before the window at its running total", () => {
    const data = parseVotes(
      response([
        { slot: 10, event: VoteKind.Notar, ms: 1, cumulativeStake: 600 },
        { slot: 10, event: VoteKind.Notar, ms: 2, cumulativeStake: 700 },
      ]),
      referenceNs,
    );
    expectCurve(data.get(10)?.curves[VoteKind.Notar], {
      ts: [1, 2],
      frac: [0.6, 0.7],
    });
  });

  it("skips vote rows without a running total", () => {
    const data = parseVotes(
      response([
        vote(10, VoteKind.Notar, 1, 100),
        { slot: 10, event: VoteKind.Notar, ms: 2, cumulativeStake: null },
      ]),
      referenceNs,
    );
    expectCurve(data.get(10)?.curves[VoteKind.Notar], {
      ts: [1],
      frac: [0.1],
    });
  });
});

describe("clipVotesData", () => {
  const rows = [
    vote(10, VoteKind.Notar, 1, 100),
    vote(10, VoteKind.Notar, 4, 300),
    vote(11, VoteKind.Skip, 2, 50),
    { slot: 10, event: CertKind.Notar, ms: 5 },
  ];

  it("keeps cumulative stake in range and drops empty slots", () => {
    const clipped = clipVotesData(
      parseVotes(response(rows), referenceNs),
      3,
      10,
    );

    expectCurve(clipped.get(10)?.curves[VoteKind.Notar], {
      ts: [4],
      frac: [0.4],
    });
    expect(clipped.get(10)?.certs.get(CertKind.Notar)).toBe(5);
    expect(clipped.has(11)).toBe(false);
  });

  it("merges adjacent ranges back to the unclipped data", () => {
    const data = parseVotes(response(rows), referenceNs);
    const merged = buildSlotVotes([
      clipVotesData(data, 0, 3),
      clipVotesData(data, 3, 10),
    ]);

    expectCurve(merged.get(10)?.notar, { ts: [1, 4], frac: [0.1, 0.4] });
    expectCurve(merged.get(11)?.skipAll, { ts: [2], frac: [0.05] });
    expect(merged.get(10)?.certs.get(CertKind.Notar)).toBe(5);
  });
});

describe("buildSlotVotes merging windows", () => {
  const total = 1000;

  // seeded so failures reproduce
  function createRandom(seed: number) {
    let state = seed;
    return () => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state / 2_147_483_648;
    };
  }

  function randomRows(random: () => number, eventOffset: number) {
    const rows: Row[] = [];
    for (let slot = 10; slot < 13; slot++) {
      for (const kind of [VoteKind.Notar, VoteKind.Skip]) {
        let ms = slot * 100 + random() * 50;
        for (let i = 0; i < 1 + random() * 40; i++) {
          ms += random() < 0.2 ? 0 : random() * 20;
          rows.push({
            slot,
            event: eventOffset + kind,
            ms: Math.round(ms),
            stake: 1 + Math.floor(random() * 30),
          });
        }
      }
    }
    return rows.sort((a, b) => a.ms - b.ms);
  }

  function getTrueFrac(rows: Row[], slot: number, kind: VoteKind, ms: number) {
    let stake = 0;
    for (const row of rows) {
      if (row.slot === slot && row.event % 21 === kind && row.ms <= ms) {
        stake += row.stake ?? 0;
      }
    }
    return stake / total;
  }

  // the curve as drawn: the last point at or before ms
  function getStepFrac(
    { ts, frac }: { ts: number[]; frac: number[] },
    ms: number,
  ) {
    let value = 0;
    for (let i = 0; i < ts.length && ts[i] <= ms; i++) value = frac[i];
    return value;
  }

  it("matches the true curve at every vote however windows split and merge", () => {
    const random = createRandom(7);
    for (let run = 0; run < 300; run++) {
      const isBatch = run % 2 === 1;
      const eventOffset = isBatch ? VOTE_BATCH_EVENT_OFFSET : 0;
      const rows = randomRows(random, eventOffset);
      const cuts = Array.from({ length: Math.floor(random() * 4) }, () =>
        Math.round(1_000 + random() * 400),
      ).sort((a, b) => a - b);
      const windows = [...cuts, Infinity].map((cutMs, i) =>
        rows.filter((r) => r.ms >= (cuts[i - 1] ?? -Infinity) && r.ms < cutMs),
      );
      const tiles = splitResponses(windows)
        .map((res) => ({
          ...res,
          granularity: isBatch ? ("vote_batch" as const) : ("vote" as const),
        }))
        .map((res) => parseVotes(res, referenceNs))
        .sort(() => random() - 0.5);
      const tolerance = isBatch ? 1e-9 : MIN_STEP_FRAC;

      const slotVotes = buildSlotVotes(tiles);
      for (const [slot, votes] of slotVotes) {
        for (const [kind, curve] of [
          [VoteKind.Notar, votes.notar],
          [VoteKind.Skip, votes.skipAll],
        ] as const) {
          for (const { ms } of rows.filter(
            (r) => r.slot === slot && r.event % 21 === kind,
          )) {
            for (const atMs of [ms - 0.5, ms]) {
              const error = Math.abs(
                getStepFrac(curve, atMs) - getTrueFrac(rows, slot, kind, atMs),
              );
              expect(error).toBeLessThanOrEqual(tolerance);
            }
          }
        }
      }
    }
  });
});

describe("buildSlotVotes", () => {
  it("combines tiles and derives finalize and skip curves", () => {
    const [tileA, tileB] = splitResponses([
      [vote(10, VoteKind.Notar, 1, 100), vote(10, VoteKind.Skip, 1, 100)],
      [
        vote(10, VoteKind.Notar, 2, 300),
        vote(10, VoteKind.Finalize, 3, 600),
        vote(10, VoteKind.SkipFallback, 3, 200),
        { slot: 10, event: CertKind.Finalize, ms: 3 },
      ],
    ]).map((res) => parseVotes(res, referenceNs));

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

describe("getFadeTs", () => {
  it("fades after the slot's first final certificate", () => {
    const certs = new Map([
      [CertKind.Notar, 30],
      [CertKind.Finalize, 50],
      [CertKind.FastFinalize, 70],
    ]);
    expect(getFadeTs(certs)).toBe(50);
    expect(getFadeTs(new Map([[CertKind.FastFinalize, 70]]))).toBe(70);
  });

  it("fades a skipped slot after its skip certificate", () => {
    expect(getFadeTs(new Map([[CertKind.Skip, 54]]))).toBe(54);
  });

  it("doesn't fade a slot without a final certificate", () => {
    expect(getFadeTs(new Map([[CertKind.Notar, 30]]))).toBeUndefined();
  });
});
