import { getDefaultStore } from "jotai";

import { nsPerMs } from "../../../consts";
import type { ReplayFee } from "../../../atoms";
import { replayFeesAtom } from "../../../atoms";
import {
  mockMaxSlotCompletedTsNsAtom,
  mockSlot0StartMsAtom,
  mockSlotToTsMs,
  mockTsToSlot,
} from "../SlotsTrack/mockUtils";

const MOCK_RESPONSE_DELAY_MS = 200;
const MOCK_SLOT_DURATION_MS = 400;
const FEES_PER_SLOT = 10;

const store = getDefaultStore();

/**
 * Deterministic pseudo-random hash of a slot number in [0, 1)
 */
function getHash(n: number): number {
  // xorshift-style integer mix, then normalize to [0, 1).
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 0xffffffff;
}

function buildMockFees(startTsMs: number, endTsMs: number): ReplayFee[] {
  const mockWorldEndNs = store.get(mockMaxSlotCompletedTsNsAtom) ?? 0n;
  const maxCompletedTsMs = Number(mockWorldEndNs / BigInt(nsPerMs));
  const maxCompletedSlot = mockTsToSlot(maxCompletedTsMs) - 1;

  const startSlot = Math.max(mockTsToSlot(startTsMs), 0);
  const endSlot = Math.min(mockTsToSlot(endTsMs), maxCompletedSlot);

  const output: ReplayFee[] = [];

  if (endSlot - startSlot <= 8) {
    const start = mockSlotToTsMs(startSlot);
    const feeWidthMs = MOCK_SLOT_DURATION_MS / FEES_PER_SLOT;
    for (let i = 0; i < FEES_PER_SLOT * (endSlot - startSlot); i++) {
      const feeStartMs = start + i * feeWidthMs;
      output.push({
        startTsMs: feeStartMs,
        endTsMs: feeStartMs + feeWidthMs,
        value: getHash(startSlot * FEES_PER_SLOT + i) * 100,
      });
    }
    return output;
  }

  for (let slot = startSlot; slot <= endSlot; slot++) {
    output.push({
      startTsMs: mockSlotToTsMs(slot),
      endTsMs: mockSlotToTsMs(slot + 1),
      value: getHash(slot) * 100,
    });
  }
  return output;
}

export function queryMockReplayFees(startTsMs: number, endTsMs: number) {
  if (endTsMs - startTsMs < 0) return;

  const slot0StartMs = store.get(mockSlot0StartMsAtom);
  if (slot0StartMs == null) return;

  setTimeout(() => {
    store.set(replayFeesAtom, buildMockFees(startTsMs, endTsMs));
  }, MOCK_RESPONSE_DELAY_MS);
}
