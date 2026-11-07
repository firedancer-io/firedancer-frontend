import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultStore } from "jotai";
import { socketStateAtom } from "../../../api/ws/atoms";
import { SocketState } from "../../../api/ws/types";
import type { TimelineVotes, VotesGranularity } from "../../../api/types";
import { startupTimeAtom } from "../../../api/atoms";
import { timelineVotesSchema } from "../../../api/entities";
import { votesCaches, votesRequests } from "./votesCache";

interface SentMessage {
  id: number;
  params: { start_ns: string; end_ns: string; granularity: VotesGranularity };
}
const sent: SentMessage[] = [];
vi.mock("../../../api/worker/useWsWorker", () => ({
  sendMessage: (message: SentMessage) => sent.push(message),
}));

const sNs = 1_000_000_000n;
const cache = votesCaches.vote_batch;

function response(startNs: bigint, availableEndNs: bigint): TimelineVotes {
  return timelineVotesSchema.parse({
    granularity: "vote_batch",
    available_start_ns: 0n,
    available_end_ns: availableEndNs,
    reference_slot: 100,
    reference_ts: startNs + sNs,
    slot_delta: [0],
    event: [21],
    event_ts_delta: [0n],
    stake: [500n],
    total_stake: 1000n,
    next_epoch_start_slot: null,
    next_total_stake: null,
  });
}

describe("votes batch cache", () => {
  beforeEach(() => {
    const store = getDefaultStore();
    store.set(socketStateAtom, SocketState.Connected);
    store.set(startupTimeAtom, { startupTimeNanos: 0n });
    cache.reset();
    sent.length = 0;
  });

  it("caches a historical tile from an unchunked response", async () => {
    // a past tile, with the world end and newest retained vote well after it
    cache.requestRange([0n, 32n * sNs - 1n], 600n * sNs);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const [{ id, params }] = sent;
    expect(params.granularity).toBe("vote_batch");
    votesRequests.resolve(id, {
      value: response(BigInt(params.start_ns), 590n * sNs),
    });

    await vi.waitFor(() => expect(cache.getTiles()).toHaveLength(1));
    expect(cache.getTiles()[0].data.get(100)?.curves[0].frac).toEqual([0.5]);
  });

  it("fetches the live tile as single votes", async () => {
    const liveDeltas: unknown[] = [];
    const unsubscribe = cache.subscribe(
      (delta) => delta.kind === "live" && liveDeltas.push(delta),
    );

    cache.requestRange([0n, 32n * sNs - 1n], 10n * sNs);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const [{ id, params }] = sent;
    expect(params.granularity).toBe("vote");
    votesRequests.resolve(id, {
      value: response(BigInt(params.start_ns), 9n * sNs),
    });

    await vi.waitFor(() => expect(liveDeltas).toHaveLength(1));
    unsubscribe();
  });
});
