import { describe, it, expect, vi } from "vitest";
import { getDefaultStore } from "jotai";
import { startupTimeAtom } from "../../../api/atoms";
import { socketStateAtom } from "../../../api/ws/atoms";
import { SocketState } from "../../../api/ws/types";
import { TileState, TileStatesGranularityEnum } from "../../../api/entities";
import type { TimelineTileStates } from "../../../api/types";
import { sendMessage } from "../../../api/worker/useWsWorker";
import { tileStatesCaches, tileStatesRequests } from "./tileStatesCache";

vi.mock("../../../api/worker/useWsWorker", () => ({ sendMessage: vi.fn() }));

const ms = 1_000_000;

describe("tile states cache", () => {
  it("gives each state the slot of its slot or txn segment", async () => {
    const store = getDefaultStore();
    store.set(startupTimeAtom, { startupTimeNanos: 0n });
    store.set(socketStateAtom, SocketState.Connected);
    const cache = tileStatesCaches[TileStatesGranularityEnum.txn];
    const added = new Promise<void>((resolve) =>
      cache.subscribe((delta) => delta.kind === "add" && resolve()),
    );

    cache.requestRange([0n, 1_000n * BigInt(ms)], 100_000n * BigInt(ms));
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalled());
    const { id } = vi.mocked(sendMessage).mock.calls[0][0] as { id: number };

    // execrp tile 5: an unattributed state, then a txn of slot 500.
    // replay tile 7: two slot states of slot 501.
    const response: TimelineTileStates = {
      granularity: TileStatesGranularityEnum.txn,
      available_start_ns: 0n,
      available_end_ns: 1_000n * BigInt(ms),
      start_ts: 0n,
      reference_slot: 500,
      tile: [5, 7],
      state_cnt: Int32Array.from([3, 2]),
      state: Int32Array.from([
        TileState.BlockedOnTiles,
        TileState.Loading,
        TileState.Execute,
        TileState.SlotFinish,
        TileState.ExecBatch,
      ]),
      dur: Float64Array.from([ms, ms, ms, ms, ms]),
      slot_state_lo: Int32Array.from([3]),
      slot_state_cnt: Int32Array.from([2]),
      slot_delta: Int32Array.from([1]),
      txn_state_lo: Int32Array.from([1]),
      txn_state_cnt: Int32Array.from([2]),
      txn_slot_delta: Int32Array.from([0]),
      txn_idx: Int32Array.from([0]),
      txn_error_code: Float64Array.from([0]),
    };
    tileStatesRequests.resolve(id, { value: response });
    await added;

    const [tile] = cache.getTiles();
    expect(tile.data.state_slot).toEqual([NaN, 500, 500, 501, 501]);
    expect(tile.data.txn_slot).toEqual([500]);
  });
});
