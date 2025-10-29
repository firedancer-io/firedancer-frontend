import { useAtomValue } from "jotai";
import { useRef, useEffect } from "react";
import { useInterval } from "react-use";
import { useValuePerSecond } from "../useValuePerSecond";
import { completedSlotAtom } from "../../../../api/atoms";
import { catchingUpStartSlotAtom, latestTurbineSlotAtom } from "./atoms";

const rateCalcWindowMs = 10_000;

/**
 * Provides a ref that estimates how many slots will be replayed in total
 */
export default function useEstimateTotalSlots() {
  const totalSlotsRef = useRef<number>();
  const startSlot = useAtomValue(catchingUpStartSlotAtom);
  const latestTurbineSlot = useAtomValue(latestTurbineSlotAtom);
  const latestReplaySlot = useAtomValue(completedSlotAtom);

  const replaySlot =
    latestReplaySlot ?? (startSlot == null ? undefined : startSlot - 1);

  const { valuePerSecond: replayRate } = useValuePerSecond(
    replaySlot,
    rateCalcWindowMs,
  );
  const { valuePerSecond: turbineRate } = useValuePerSecond(
    latestTurbineSlot,
    rateCalcWindowMs,
  );

  // initialize estimate of how many slots we'll need to replay
  // determines initial widths
  useEffect(() => {
    if (
      startSlot == null ||
      latestTurbineSlot == null ||
      totalSlotsRef.current != null
    )
      return;

    totalSlotsRef.current = calculateTotalSlots(
      400,
      100,
      startSlot,
      latestReplaySlot,
      latestTurbineSlot,
    );
  }, [latestReplaySlot, latestTurbineSlot, startSlot, totalSlotsRef]);

  // only reduce estimate, to prevent the drawn bars from being compressed to the left
  useInterval(() => {
    const prevEstimate = totalSlotsRef.current;

    if (
      startSlot == null ||
      latestTurbineSlot == null ||
      totalSlotsRef.current == null ||
      replayRate == null ||
      turbineRate == null ||
      !prevEstimate
    ) {
      return;
    }

    const newEstimate = calculateTotalSlots(
      replayRate,
      turbineRate,
      startSlot,
      latestReplaySlot,
      latestTurbineSlot,
    );

    if (!newEstimate || newEstimate >= prevEstimate) return;

    // decrement gradually
    const diffToApply = Math.min(
      0.15 * prevEstimate,
      prevEstimate - newEstimate,
    );

    totalSlotsRef.current = prevEstimate - diffToApply;
  }, 500);

  return totalSlotsRef;
}

/**
 * Calculate how many slots will end up being replayed by the time
 * replay catches up to turbine head.
 */
function calculateTotalSlots(
  replayRate: number,
  turbineRate: number,
  startSlot: number,
  latestReplaySlot: number | undefined,
  latestTurbineSlot: number,
) {
  const replaySlot = latestReplaySlot ?? startSlot - 1;

  if (replaySlot === latestTurbineSlot) {
    // completed state
    return latestTurbineSlot - startSlot;
  }

  // infinite slots
  if (replayRate <= turbineRate) return;

  const replayedSlots = replaySlot - startSlot + 1;

  const projectedSlotsToReplay =
    (replayRate * (latestTurbineSlot - replaySlot)) /
    (replayRate - turbineRate);

  return replayedSlots + projectedSlotsToReplay;
}
