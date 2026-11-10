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

function response(
  startNs: bigint,
  availableEndNs: bigint,
  cumulativeStake = 500,
): TimelineVotes {
  return timelineVotesSchema.parse({
    granularity: "vote_batch",
    available_start_ns: 0n,
    available_end_ns: availableEndNs,
    reference_slot: 100,
    reference_ts: startNs + sNs,
    slot_delta: [0],
    event: [21],
    event_ts_delta: [0n],
    cumulative_stake: [String(cumulativeStake)],
    total_stake: 1000n,
    next_epoch_start_slot: null,
    next_total_stake: null,
  });
}

describe("votes batch cache", () => {
  let perfNow = 0;

  beforeEach(() => {
    perfNow = 0;
    vi.spyOn(performance, "now").mockImplementation(() => perfNow);
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

  it("merges live batch pieces by their running totals", async () => {
    let liveTile: ReturnType<typeof cache.getTiles>[number] | undefined;
    const unsubscribe = cache.subscribe((delta) => {
      if (delta.kind === "live" && delta.tile.startNs === 0n) {
        liveTile = delta.tile;
      }
    });
    const view: [bigint, bigint] = [0n, 32n * sNs - 1n];
    let resolved = 0;
    const resolveNext = async (availableEndNs: bigint, stake: number) => {
      const index = resolved++;
      await vi.waitFor(() => expect(sent).toHaveLength(index + 1));
      const { id, params } = sent[index];
      expect(params.granularity).toBe("vote_batch");
      votesRequests.resolve(id, {
        value: response(BigInt(params.start_ns), availableEndNs, stake),
      });
    };

    cache.requestRange(view, 10n * sNs);
    // live first finishes the uncached tile before the world end's
    await resolveNext(0n, 100);
    await resolveNext(9n * sNs, 300);
    await vi.waitFor(() => expect(liveTile).toBeDefined());

    perfNow += 200;
    cache.requestRange(view, 20n * sNs);
    await resolveNext(19n * sNs, 700);

    await vi.waitFor(() =>
      expect(liveTile?.data.get(100)?.curves[0].frac).toEqual([0.3, 0.7]),
    );
    unsubscribe();
  });
});
