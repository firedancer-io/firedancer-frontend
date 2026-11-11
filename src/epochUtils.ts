import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { epochScheduleAtom } from "./atoms";
import type { EpochScheduleConfig } from "./api/types";

const MINIMUM_SLOTS_PER_EPOCH = 32;

function floorLog2(value: number) {
  return Math.floor(Math.log2(value));
}

export function epochForSlot(slot: number, schedule: EpochScheduleConfig) {
  const { slots_per_epoch, first_normal_epoch, first_normal_slot, warmup } =
    schedule;

  if (warmup && slot < first_normal_slot) {
    return (
      floorLog2(slot + MINIMUM_SLOTS_PER_EPOCH) -
      floorLog2(MINIMUM_SLOTS_PER_EPOCH)
    );
  }

  return (
    first_normal_epoch +
    Math.floor((slot - first_normal_slot) / slots_per_epoch)
  );
}

export function useGetEpochForSlot() {
  const schedule = useAtomValue(epochScheduleAtom);
  return useMemo(
    () =>
      schedule ? (slot: number) => epochForSlot(slot, schedule) : undefined,
    [schedule],
  );
}

export function epochLabel(epochNumber: number | undefined) {
  return epochNumber != null ? `Epoch ${epochNumber}` : "Epoch";
}
