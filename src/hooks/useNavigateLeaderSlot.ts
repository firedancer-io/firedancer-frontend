import { useAtomValue, useSetAtom } from "jotai";
import { useMemo } from "react";
import {
  leaderSlotsAtom,
  currentLeaderSlotAtom,
  slotOverrideAtom,
} from "../atoms";

export default function useNavigateLeaderSlot() {
  const leaderSlots = useAtomValue(leaderSlotsAtom);
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);
  const slotOverride = useAtomValue(slotOverrideAtom);
  const setSlotOverride = useSetAtom(slotOverrideAtom);

  const [prevLeaderSlotIndex, nextLeaderSlotIndex] = useMemo(() => {
    if (leaderSlots === undefined) return [-1, -1];

    const nextLeaderSlotIndex = leaderSlots.findIndex(
      (slot) => slot > (slotOverride ?? currentLeaderSlot ?? 0)
    );

    let prevLeaderSlotIndex = nextLeaderSlotIndex - 1;
    if (
      prevLeaderSlotIndex ===
      leaderSlots.findIndex(
        (slot) => slot === (slotOverride ?? currentLeaderSlot ?? 0)
      )
    )
      prevLeaderSlotIndex--;

    return [prevLeaderSlotIndex, nextLeaderSlotIndex];
  }, [currentLeaderSlot, leaderSlots, slotOverride]);

  return useMemo(
    () => ({
      navPrevLeaderSlot: (leaderSlotGroups: number = 1) => {
        if (prevLeaderSlotIndex > -1 && leaderSlotGroups > 0) {
          const slot =
            leaderSlots?.[prevLeaderSlotIndex - leaderSlotGroups + 1];
          if (slot !== undefined) {
            setSlotOverride(slot);
          }
        }
      },
      navNextLeaderSlot: (leaderSlotGroups: number = 1) => {
        if (nextLeaderSlotIndex > -1 && leaderSlotGroups > 0) {
          const slot =
            leaderSlots?.[nextLeaderSlotIndex + leaderSlotGroups - 1];
          if (slot !== undefined) {
            setSlotOverride(slot);
          }
        }
      },
    }),
    [leaderSlots, nextLeaderSlotIndex, prevLeaderSlotIndex, setSlotOverride]
  );
}
