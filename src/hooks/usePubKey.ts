import { useAtomValue } from "jotai";
import { epochAtom } from "../atoms";

export function usePubKey(slot: number) {
  const epoch = useAtomValue(epochAtom);
  if (!epoch) return;

  const slotEpochIndex = slot - epoch.start_slot;
  const leaderEpochIndex = Math.trunc(slotEpochIndex / 4);
  return epoch.staked_pubkeys[epoch.leader_slots[leaderEpochIndex]];
}
