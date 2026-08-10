import { getDefaultStore } from "jotai";

import { nsPerMs } from "../../../consts";
import type { ReplayLine } from "../../../atoms";
import { replayLinesAtom } from "../../../atoms";
import {
  mockMaxSlotCompletedTsNsAtom,
  mockSlot0StartMsAtom,
  mockSlotToTsMs,
  mockTsToSlot,
} from "../SlotsTrack/mockUtils";

const MOCK_RESPONSE_DELAY_MS = 200;
const MOCK_SLOT_DURATION_MS = 400;
const POINTS_PER_SLOT = 10;

const NUM_MOCK_LINES = 3;
const LINE_HASH_OFFSET = 1_000_000;

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

function buildMockLine(
  startTsMs: number,
  endTsMs: number,
  lineIdx: number,
): ReplayLine {
  const mockWorldEndNs = store.get(mockMaxSlotCompletedTsNsAtom) ?? 0n;
  const maxCompletedTsMs = Number(mockWorldEndNs / BigInt(nsPerMs));
  const maxCompletedSlot = mockTsToSlot(maxCompletedTsMs) - 1;

  const startSlot = Math.max(mockTsToSlot(startTsMs), 0);
  const endSlot = Math.min(mockTsToSlot(endTsMs), maxCompletedSlot);

  const output: ReplayLine = [];

  // Right edge of the completed region: the end of the last usable slot, clamped
  // to maxCompletedTsMs. Points are sampled at slot/gap centers, so without this
  // the line would stop ~half a slot short of the visible right edge.
  const edgeTsMs = Math.min(mockSlotToTsMs(endSlot + 1), maxCompletedTsMs);
  const edgeValue = getHash(endSlot + 1 + lineIdx * LINE_HASH_OFFSET) * 100;

  if (endSlot - startSlot <= 8) {
    const start = mockSlotToTsMs(startSlot);
    const gapWidth = MOCK_SLOT_DURATION_MS / POINTS_PER_SLOT;
    for (let i = 0; i < POINTS_PER_SLOT * (endSlot - startSlot); i++) {
      const gapStartMs = start + i * gapWidth;
      const gapEndMs = gapStartMs + gapWidth;
      output.push({
        tsMs: (gapStartMs + gapEndMs) / 2,
        value:
          getHash(
            startSlot * POINTS_PER_SLOT + i + lineIdx * LINE_HASH_OFFSET,
          ) * 100,
      });
    }
  } else {
    for (let slot = startSlot; slot <= endSlot; slot++) {
      const slotStartMs = mockSlotToTsMs(slot);
      const slotEndMs = mockSlotToTsMs(slot + 1);
      output.push({
        tsMs: (slotStartMs + slotEndMs) / 2,
        value: getHash(slot + lineIdx * LINE_HASH_OFFSET) * 100,
      });
    }
  }

  // Extend the line to the right edge of the completed region so it reaches the
  // visible edge instead of stopping at the last slot center.
  const lastPoint = output[output.length - 1];
  if (lastPoint && edgeTsMs > lastPoint.tsMs) {
    output.push({ tsMs: edgeTsMs, value: edgeValue });
  }

  return output;
}

export function queryMockReplayLines(startTsMs: number, endTsMs: number) {
  if (endTsMs - startTsMs < 0) return;

  const slot0StartMs = store.get(mockSlot0StartMsAtom);
  if (slot0StartMs == null) return;

  setTimeout(() => {
    const lines = Array.from({ length: NUM_MOCK_LINES }, (_, lineIdx) =>
      buildMockLine(startTsMs, endTsMs, lineIdx),
    );
    store.set(replayLinesAtom, lines);
  }, MOCK_RESPONSE_DELAY_MS);
}
