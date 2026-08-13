import { getDefaultStore } from "jotai";

import { replayMiniMapAtom } from "../../../atoms";
import { buildMockSlots, mockSlot0StartMsAtom } from "../SlotsTrack/mockUtils";

const MOCK_RESPONSE_DELAY_MS = 400;
export const MOCK_SLOT_DURATION_MS = 400;

const store = getDefaultStore();

export function queryMockReplaySlots(startTsMs: number, endTsMs: number) {
  if (endTsMs < startTsMs) return;

  const slot0StartMs = store.get(mockSlot0StartMsAtom);
  if (slot0StartMs == null) return;

  setTimeout(() => {
    store.set(replayMiniMapAtom, buildMockSlots(startTsMs, endTsMs));
  }, MOCK_RESPONSE_DELAY_MS);
}
