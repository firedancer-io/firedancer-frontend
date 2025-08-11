import { slotsPerLeader } from "../consts";
import { atom, useAtomValue } from "jotai";
import { slotPublishAtomFamily } from "../atoms";
import memoize from "micro-memoize";
import { getSlotGroupLeader } from "../utils";

const leaderGroupSkippedAtom = memoize(
  (slot: number) =>
    atom((get) => {
      const slotGroupLeader = getSlotGroupLeader(slot);
      for (let i = 0; i < slotsPerLeader; i++) {
        if (get(slotPublishAtomFamily(slotGroupLeader + i))?.skipped)
          return true;
      }
      return false;
    }),
  { maxSize: 500 },
);

/** Hook does not query for slot status, assumes another component will fill the status cache */
export function useIsLeaderGroupSkipped(slot: number) {
  return useAtomValue(leaderGroupSkippedAtom(slot));
}
