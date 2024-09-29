import { useAtomValue } from "jotai";
import { Duration } from "luxon";
import { useMemo, useState } from "react";
import {
  prevLeaderSlotAtom,
  nextLeaderSlotAtom,
  currentSlotAtom,
  isCurrentlyLeaderAtom,
  slotDurationAtom,
  nextEpochLeaderSlotAtom,
} from "../atoms";
import { getTimeTillText } from "../utils";
import { useInterval } from "react-use";

export default function useNextSlot() {
  const prevLeaderSlot = useAtomValue(prevLeaderSlotAtom);
  const _nextLeaderSlot = useAtomValue(nextLeaderSlotAtom);
  const nextEpochLeaderSlot = useAtomValue(nextEpochLeaderSlotAtom);
  const nextLeaderSlot = _nextLeaderSlot ?? nextEpochLeaderSlot;
  const currentSlot = useAtomValue(currentSlotAtom);
  const isLeader = useAtomValue(isCurrentlyLeaderAtom);
  const slotDuration = useAtomValue(slotDurationAtom);

  const [estimatedSlot, setEstimatedSlot] = useState(currentSlot);

  useInterval(() => {
    setEstimatedSlot((prevEstimated) => {
      if (!currentSlot) return prevEstimated;

      if (!prevEstimated) return currentSlot;

      const diff = prevEstimated - currentSlot;

      if (diff > 10) {
        return prevEstimated - Math.trunc(diff / 2);
      }

      if (diff > 4) {
        return prevEstimated;
      }

      if (diff < -4) {
        return prevEstimated - Math.trunc(diff / 2);
      }

      return prevEstimated + 1;
    });
  }, slotDuration);

  const nextSlotDuration = useMemo(() => {
    if (nextLeaderSlot == null || estimatedSlot == null) return;

    return Duration.fromMillis(
      slotDuration * (nextLeaderSlot - estimatedSlot)
    ).rescale();
  }, [estimatedSlot, nextLeaderSlot, slotDuration]);

  const progressSinceLastLeader = useMemo(() => {
    if (
      prevLeaderSlot == null ||
      nextLeaderSlot == null ||
      estimatedSlot == null
    )
      return;

    const leaderSlotDiff = nextLeaderSlot - prevLeaderSlot;
    const currentSlotDiff = estimatedSlot - prevLeaderSlot;

    const progress = (currentSlotDiff / leaderSlotDiff) * 100;
    if (progress < 0 || progress > 100) return 0;

    return progress;
  }, [estimatedSlot, nextLeaderSlot, prevLeaderSlot]);

  return {
    progressSinceLastLeader: isLeader ? 100 : (progressSinceLastLeader ?? 0),
    nextSlotText: isLeader ? "Now" : getTimeTillText(nextSlotDuration),
    nextLeaderSlot: isLeader ? currentSlot : nextLeaderSlot,
  };
}
