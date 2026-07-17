import { useRef } from "react";
import { slotsPerLeader } from "../../consts";
import { itemHeightByType, ItemHeightType } from "./const";

/**
 * Keep track of height deltas as currentLeaderSlot increments by one
 */
export function useHeightDeltas(
  yourSlotsOnly: boolean,
  currentLeaderSlot: number | undefined,
  yourNextLeaderSlot: number | undefined,
  yourLeaderSlotsSet: Set<number> | undefined,
) {
  const prevYourLeaderSlotsSetRef = useRef<Set<number> | undefined>(
    yourLeaderSlotsSet,
  );
  const prevCurrentLeaderSlotRef = useRef<number | undefined>();
  const prevYourNextLeaderSlotRef = useRef<number | undefined>();
  const slotHeightDeltasRef = useRef<Map<number, number>>();

  if (yourLeaderSlotsSet == null) return;

  // reset refs if leader set changes (e.g. on epoch change)
  if (prevYourLeaderSlotsSetRef.current !== yourLeaderSlotsSet) {
    prevYourLeaderSlotsSetRef.current = yourLeaderSlotsSet;
    prevCurrentLeaderSlotRef.current = undefined;
    prevYourNextLeaderSlotRef.current = undefined;
    slotHeightDeltasRef.current = undefined;
  }

  const prevCurrent = prevCurrentLeaderSlotRef.current;
  const prevNextLeader = prevYourNextLeaderSlotRef.current;

  if (currentLeaderSlot == null) return;

  if (prevCurrent == null) {
    prevCurrentLeaderSlotRef.current = currentLeaderSlot;
    prevYourNextLeaderSlotRef.current = yourNextLeaderSlot;
    return;
  }

  if (currentLeaderSlot > prevCurrent + slotsPerLeader) {
    // we missed some changes. reset state
    slotHeightDeltasRef.current = undefined;
    prevCurrentLeaderSlotRef.current = currentLeaderSlot;
    prevYourNextLeaderSlotRef.current = yourNextLeaderSlot;
    return;
  }

  if (prevCurrent === currentLeaderSlot) {
    return {
      slotHeightDeltas: slotHeightDeltasRef.current,
    };
  }

  if (prevNextLeader != null && prevNextLeader !== yourNextLeaderSlot) {
    // previous your next leader -> (your) current
    slotHeightDeltasRef.current = getUpdatedDeltas(
      slotHeightDeltasRef.current,
      prevNextLeader,
      itemHeightByType[ItemHeightType.YourCurrent] -
        itemHeightByType[ItemHeightType.YourNextLeader],
    );

    if (yourNextLeaderSlot != null) {
      // future (your) slot -> your next leader
      slotHeightDeltasRef.current = getUpdatedDeltas(
        slotHeightDeltasRef.current,
        yourNextLeaderSlot,
        itemHeightByType[ItemHeightType.YourNextLeader] -
          itemHeightByType[ItemHeightType.YourNonNextFuture],
      );
    }
  } else if (!yourSlotsOnly) {
    // future (not your) slot -> (not your) current
    // ignore change for only your slots list, because this slot is not in the list
    slotHeightDeltasRef.current = getUpdatedDeltas(
      slotHeightDeltasRef.current,
      currentLeaderSlot,
      itemHeightByType[ItemHeightType.OtherCurrent] -
        itemHeightByType[ItemHeightType.OtherFuture],
    );
  }

  const wasPrevCurrentYours = yourLeaderSlotsSet.has(prevCurrent);
  if (wasPrevCurrentYours) {
    // prev (your) current -> (your) past
    slotHeightDeltasRef.current = getUpdatedDeltas(
      slotHeightDeltasRef.current,
      prevCurrent,
      itemHeightByType[ItemHeightType.YourPast] -
        itemHeightByType[ItemHeightType.YourCurrent],
    );
  } else if (!yourSlotsOnly) {
    // prev (not your) current -> (not your) past
    slotHeightDeltasRef.current = getUpdatedDeltas(
      slotHeightDeltasRef.current,
      prevCurrent,
      itemHeightByType[ItemHeightType.OtherPast] -
        itemHeightByType[ItemHeightType.OtherCurrent],
    );
  }

  prevCurrentLeaderSlotRef.current = currentLeaderSlot;
  prevYourNextLeaderSlotRef.current = yourNextLeaderSlot;

  return {
    slotHeightDeltas: slotHeightDeltasRef.current,
  };
}

/**
 * Update slot delta value. If a value already exists for this slot,
 * the new value is the sum of previour + incoming delta
 */
function getUpdatedDeltas(
  _deltasMap: Map<number, number> | undefined,
  slot: number,
  delta: number,
) {
  const deltasMap = _deltasMap ?? new Map<number, number>();

  const prevDelta = deltasMap.get(slot);
  const newDelta = prevDelta == null ? delta : prevDelta + delta;

  if (newDelta === 0) {
    deltasMap.delete(slot);
  } else {
    deltasMap.set(slot, newDelta);
  }

  return deltasMap;
}
