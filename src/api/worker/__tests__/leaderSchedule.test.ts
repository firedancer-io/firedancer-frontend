import {
  expect,
  describe,
  it,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest";
import { deriveLeaderSchedule, schedFnv1a64 } from "../leaderSchedule";
import { fillEpochLeaderSlots } from "../epochLeaderSlots";
import { WsMessageSchema } from "../wsMessage";

// Vectors generated from Firedancer's fd_epoch_leaders_new; fnv1a64
// covers the full sched array, schedHead the first 32 entries.
const vectors = [
  {
    name: "ties",
    epoch: "123",
    slotCnt: 4000,
    weights: Array<string>(10).fill("1000"),
    // prettier-ignore
    schedHead: [
      0, 7, 8, 6, 0, 7, 5, 9, 5, 1, 0, 3, 6, 0, 8, 8,
      7, 1, 9, 2, 5, 7, 2, 1, 0, 7, 0, 4, 9, 7, 5, 8,
    ],
    fnv1a64: "e3667e106612b8f4",
  },
  {
    name: "bigepoch",
    epoch: "81985529216486895",
    slotCnt: 4000,
    weights: ["900", "800", "800", "400", "100", "50", "1"],
    // prettier-ignore
    schedHead: [
      1, 5, 4, 1, 3, 3, 2, 2, 0, 0, 2, 5, 2, 2, 1, 0,
      0, 4, 0, 1, 1, 1, 0, 0, 0, 2, 2, 3, 3, 0, 0, 0,
    ],
    fnv1a64: "86698fe615f5bdf0",
  },
  {
    name: "hugestakes",
    epoch: "999",
    slotCnt: 4000,
    weights: [
      "9000000000000000000",
      "5000000000000000000",
      "3900000000000000000",
    ],
    // prettier-ignore
    schedHead: [
      0, 2, 1, 1, 0, 0, 0, 2, 2, 0, 0, 2, 0, 1, 0, 2,
      1, 1, 0, 2, 1, 0, 2, 2, 1, 0, 0, 2, 0, 0, 1, 2,
    ],
    fnv1a64: "ed67c340c42cb515",
  },
];

describe("deriveLeaderSchedule", () => {
  it.each(vectors)(
    "matches fd_epoch_leaders vector $name",
    ({ epoch, slotCnt, weights, schedHead, fnv1a64 }) => {
      const sched = deriveLeaderSchedule(
        BigInt(epoch),
        weights.map(BigInt),
        slotCnt,
      );
      expect(sched.length).toBe(slotCnt / 4);
      expect([...sched.slice(0, schedHead.length)]).toEqual(schedHead);
      expect(schedFnv1a64(sched)).toBe(fnv1a64);
    },
  );
});

const ties = vectors[0];
const tiesValue = {
  epoch: 123,
  start_time_nanos: null,
  end_time_nanos: null,
  start_slot: 1_000_000,
  end_slot: 1_003_999,
  excluded_stake_lamports: "0",
  staked_pubkeys: ties.weights.map((_, i) => `pubkey${i}`),
  staked_lamports: ties.weights,
};

function parseEpochMessage(value: object) {
  const msg = WsMessageSchema.parse({ topic: "epoch", key: "new", value });
  if (msg.topic !== "epoch") throw new Error("unreachable");
  return msg;
}

describe("fillEpochLeaderSlots", () => {
  let errorSpy: MockInstance;

  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("derives leader_slots when the backend omits them", () => {
    const msg = parseEpochMessage(tiesValue);
    expect(msg.value.leader_slots).toBeUndefined();
    expect(msg.value.staked_lamports[0]).toBe(1000n);

    const filled = fillEpochLeaderSlots(msg);
    if (filled.topic !== "epoch") throw new Error("unreachable");
    const slots = filled.value.leader_slots;
    // derived schedules stay typed for buffer transfer to the main thread
    expect(slots).toBeInstanceOf(Uint32Array);
    expect(slots.length).toBe(ties.slotCnt / 4);
    expect(Array.from(slots.slice(0, ties.schedHead.length))).toEqual(
      ties.schedHead,
    );
    expect(schedFnv1a64(Uint32Array.from(slots))).toBe(ties.fnv1a64);
    expect(filled.value).toMatchObject(parseEpochMessage(tiesValue).value);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("verifies leader_slots_hash and errors loudly on mismatch", () => {
    const good = fillEpochLeaderSlots(
      parseEpochMessage({ ...tiesValue, leader_slots_hash: ties.fnv1a64 }),
    );
    if (good.topic !== "epoch") throw new Error("unreachable");
    expect(good.value.leader_slots.length).toBe(ties.slotCnt / 4);
    expect(errorSpy).not.toHaveBeenCalled();

    const bad = fillEpochLeaderSlots(
      parseEpochMessage({ ...tiesValue, leader_slots_hash: "0".repeat(16) }),
    );
    if (bad.topic !== "epoch") throw new Error("unreachable");
    // still delivered despite the mismatch
    expect(bad.value.leader_slots.length).toBe(ties.slotCnt / 4);
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it("passes epoch messages with leader_slots through unchanged", () => {
    const leader_slots = ties.schedHead;
    const msg = parseEpochMessage({ ...tiesValue, leader_slots });
    const out = fillEpochLeaderSlots(msg);
    expect(out).toBe(msg);
    if (out.topic !== "epoch") throw new Error("unreachable");
    expect(out.value.leader_slots).toEqual(leader_slots);
  });

  it("passes non-epoch messages through unchanged", () => {
    const msg = WsMessageSchema.parse({
      topic: "summary",
      key: "version",
      value: "1.2.3",
    });
    expect(fillEpochLeaderSlots(msg)).toBe(msg);
  });
});
