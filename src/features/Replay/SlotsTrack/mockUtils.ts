import { atom, getDefaultStore } from "jotai";

import { startupTimeAtom } from "../../../api/atoms";
import { nsPerMs } from "../../../consts";
import { slotsPerEpoch, type RgbColor } from "../const";
import type { ReplaySlot, ReplayEpoch } from "../../../atoms";
import { replaySlotsAtom, replayEpochsAtom } from "../../../atoms";

const MOCK_SKIPPED_SLOT_FRACTION = 0.05;
const MOCK_RESPONSE_DELAY_MS = 200;
export const MOCK_SLOT_DURATION_MS = 400;
const MOCK_EPOCH_DURATION_MS = slotsPerEpoch * MOCK_SLOT_DURATION_MS;

const store = getDefaultStore();

/* Mock world end that increments in multiples of 400ms, every 400ms.
 * value will be greater than the startup time
 */
export const mockMaxSlotCompletedTsNsAtom = atom<bigint>();
setInterval(() => {
  const startupNs = store.get(startupTimeAtom)?.startupTimeNanos;
  if (startupNs == null) return;

  const flooredMs =
    Math.floor(Date.now() / MOCK_SLOT_DURATION_MS) * MOCK_SLOT_DURATION_MS;
  const flooredNs = BigInt(flooredMs) * BigInt(nsPerMs);

  if (startupNs > flooredNs) return;

  store.set(mockMaxSlotCompletedTsNsAtom, BigInt(flooredMs) * BigInt(nsPerMs));
}, MOCK_SLOT_DURATION_MS);

/**
 * Start timestamp (ms) of mock slot 0 at the first 400ms boundary at or after startupTimeNs
 */
export const mockSlot0StartMsAtom = atom<number | undefined>((get) => {
  const startupTimeNs = get(startupTimeAtom)?.startupTimeNanos;
  if (startupTimeNs == null) return;

  const startupMs = Number(startupTimeNs / BigInt(nsPerMs));
  return Math.ceil(startupMs / MOCK_SLOT_DURATION_MS) * MOCK_SLOT_DURATION_MS;
});

export function mockSlotToTsMs(slot: number) {
  const slot0StartMs = store.get(mockSlot0StartMsAtom) ?? 0;
  return slot0StartMs + slot * MOCK_SLOT_DURATION_MS;
}
export function mockTsToSlot(tsMs: number) {
  const slot0StartMs = store.get(mockSlot0StartMsAtom) ?? 0;
  return Math.floor((tsMs - slot0StartMs) / MOCK_SLOT_DURATION_MS);
}

export function mockEpochToTsMs(epoch: number) {
  const slot0StartMs = store.get(mockSlot0StartMsAtom) ?? 0;
  return slot0StartMs + epoch * MOCK_EPOCH_DURATION_MS;
}
export function mockTsToEpoch(tsMs: number) {
  const slot0StartMs = store.get(mockSlot0StartMsAtom) ?? 0;
  return Math.floor((tsMs - slot0StartMs) / MOCK_EPOCH_DURATION_MS);
}

/**
 * Deterministic pseudo-random hash of a slot number in [0, 1)
 */
function getSlotHash(slot: number): number {
  // xorshift-style integer mix, then normalize to [0, 1).
  let h = slot | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 0xffffffff;
}

/** Deterministic ~5% skip classification for a slot. */
export function isMockSlotSkipped(slot: number): boolean {
  return getSlotHash(slot) < MOCK_SKIPPED_SLOT_FRACTION;
}

export function getSlotColor(slot: number): RgbColor {
  return isMockSlotSkipped(slot)
    ? [235 / 255, 64 / 255, 52 / 255]
    : [84 / 255, 188 / 255, 160 / 255];
}

export function getEpochColor(epoch: number): RgbColor {
  return epoch % 2
    ? [40 / 255, 58 / 255, 130 / 255] // dark blue
    : [90 / 255, 52 / 255, 140 / 255]; // dark purple
}

/**
 * Build the list of slots for the time range, but never past mockMaxSlotCompletedTsNs
 */
function buildMockSlots(startTsMs: number, endTsMs: number): ReplaySlot[] {
  const mockWorldEndNs = store.get(mockMaxSlotCompletedTsNsAtom) ?? 0n;
  const maxCompletedTsMs = Number(mockWorldEndNs / BigInt(nsPerMs));
  const maxCompletedSlot = mockTsToSlot(maxCompletedTsMs) - 1;

  const startSlot = Math.max(mockTsToSlot(startTsMs), 0);
  const endSlot = Math.min(mockTsToSlot(endTsMs), maxCompletedSlot);

  const output: ReplaySlot[] = [];
  for (let slot = startSlot; slot <= endSlot; slot++) {
    output.push({
      slot,
      startTsMs: mockSlotToTsMs(slot),
      endTsMs: mockSlotToTsMs(slot + 1),
    });
  }
  return output;
}

/**
 * Build the list of epochs for the time range. Each epoch has slotsPerEpoch slots
 */
function buildMockEpochs(startTsMs: number, endTsMs: number): ReplayEpoch[] {
  const mockWorldEndNs = store.get(mockMaxSlotCompletedTsNsAtom) ?? 0n;
  const maxCompletedTsMs = Number(mockWorldEndNs / BigInt(nsPerMs));
  const currentEpoch = mockTsToEpoch(maxCompletedTsMs);

  const startEpoch = Math.max(mockTsToEpoch(startTsMs), 0);
  const endEpoch = Math.min(mockTsToEpoch(endTsMs), currentEpoch);

  const output: ReplayEpoch[] = [];
  for (let epoch = startEpoch; epoch <= endEpoch; epoch++) {
    output.push({
      epoch,
      startTsMs: mockEpochToTsMs(epoch),
      endTsMs: mockEpochToTsMs(epoch + 1),
    });
  }
  return output;
}

export function queryMockReplaySlots(startTsMs: number, endTsMs: number) {
  if (endTsMs < startTsMs) return;

  const slot0StartMs = store.get(mockSlot0StartMsAtom);
  if (slot0StartMs == null) return;

  setTimeout(() => {
    store.set(replaySlotsAtom, buildMockSlots(startTsMs, endTsMs));
  }, MOCK_RESPONSE_DELAY_MS);
}

export function queryMockReplayEpochs(startTsMs: number, endTsMs: number) {
  if (endTsMs < startTsMs) return;

  const slot0StartMs = store.get(mockSlot0StartMsAtom);
  if (slot0StartMs == null) return;

  setTimeout(() => {
    store.set(replayEpochsAtom, buildMockEpochs(startTsMs, endTsMs));
  }, MOCK_RESPONSE_DELAY_MS);
}
