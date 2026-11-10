import { describe, it, expect } from "vitest";
import { TileState } from "../../../api/entities";
import type { TileStateColumns } from "./tileStatesCache";
import { mergeTxnSegments } from "./hoverUtils";

const SLOT = 10;
const TXN_IDX = 3;
const TILE = 0;

function dataTile(
  txnStartMs: number,
  txnEndMs: number,
  states: [TileState, number, number][],
  errorCode: number | null = 0,
): TileStateColumns {
  return {
    state: states.map(([state]) => state),
    state_tile: states.map(() => TILE),
    state_start_ms: states.map(([, start]) => start),
    state_end_ms: states.map(([, , end]) => end),
    state_slot: states.map(() => SLOT),
    txn_slot: [SLOT],
    txn_idx: [TXN_IDX],
    txn_tile: [TILE],
    txn_start_ms: [txnStartMs],
    txn_end_ms: [txnEndMs],
    txn_error_code: [errorCode],
  };
}

describe("mergeTxnSegments", () => {
  it("keeps every state from overlapping fragments, counting overlap once", () => {
    const exec = mergeTxnSegments(
      [
        dataTile(0, 3, [
          [TileState.Loading, 0, 1],
          [TileState.Execute, 1, 3],
        ]),
        dataTile(1, 4, [
          [TileState.Execute, 1, 3],
          [TileState.PostExecute, 3, 4],
        ]),
      ],
      SLOT,
      TXN_IDX,
    )?.exec;

    expect(exec?.startMs).toBe(0);
    expect(exec?.endMs).toBe(4);
    expect(Object.fromEntries(exec?.stateMs ?? [])).toEqual({
      [TileState.Loading]: 1,
      [TileState.Execute]: 2,
      [TileState.PostExecute]: 1,
    });
  });

  it("sums a state split across disjoint fragments", () => {
    const exec = mergeTxnSegments(
      [
        dataTile(0, 2, [[TileState.Execute, 0, 2]]),
        dataTile(2, 5, [[TileState.Execute, 2, 5]]),
      ],
      SLOT,
      TXN_IDX,
    )?.exec;

    expect(exec?.stateMs.get(TileState.Execute)).toBe(5);
  });

  it("counts a partially overlapping state once", () => {
    const exec = mergeTxnSegments(
      [
        dataTile(0, 3, [[TileState.Execute, 0, 3]]),
        dataTile(2, 5, [[TileState.Execute, 2, 5]]),
      ],
      SLOT,
      TXN_IDX,
    )?.exec;

    expect(exec?.stateMs.get(TileState.Execute)).toBe(5);
  });

  it("splits sigverify from execution and keeps the latest error code", () => {
    const states = mergeTxnSegments(
      [
        dataTile(0, 1, [[TileState.Sigverify, 0, 1]], 0),
        dataTile(2, 4, [[TileState.Execute, 2, 4]], null),
        dataTile(3, 5, [[TileState.Execute, 3, 5]], 7),
      ],
      SLOT,
      TXN_IDX,
    );

    expect(states?.sigverify?.stateMs.get(TileState.Sigverify)).toBe(1);
    expect(states?.exec?.stateMs.get(TileState.Execute)).toBe(3);
    expect(states?.exec?.errorCode).toBe(7);
  });

  it("returns undefined when the txn isn't loaded", () => {
    expect(
      mergeTxnSegments(
        [dataTile(0, 1, [[TileState.Execute, 0, 1]])],
        SLOT,
        TXN_IDX + 1,
      ),
    ).toBeUndefined();
  });
});
