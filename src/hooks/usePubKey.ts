import { useAtomValue } from "jotai";
import { epochAtom, leaderScheduleAtom } from "../atoms";

export function usePubKey(slot: number) {
  const epoch = useAtomValue(epochAtom);
  const leaderSchedule = useAtomValue(leaderScheduleAtom);
  if (!epoch || !leaderSchedule) return;

  const slotEpochIndex = slot - epoch.start_slot;
  const leaderEpochIndex = Math.trunc(slotEpochIndex / 4);
  return epoch.staked_pubkeys[leaderSchedule[leaderEpochIndex]];
}
