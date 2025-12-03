import { useMemo } from "react";
import type { SlotBarInfo } from "./types";

export function useGroupedSlotBars(slotBarInfoArr: SlotBarInfo[]) {
  return useMemo(() => {
    const slotBars = new Map<number, SlotBarInfo[]>();

    const addSlotBar = (slotBarInfo: SlotBarInfo) => {
      if (slotBarInfo.slot == null) return;

      if (!slotBars.has(slotBarInfo.slot)) {
        slotBars.set(slotBarInfo.slot, [slotBarInfo]);
      } else {
        slotBars.get(slotBarInfo.slot)?.push(slotBarInfo);
      }
    };

    for (const slotBarInfo of slotBarInfoArr) {
      addSlotBar(slotBarInfo);
    }

    return slotBars;
  }, [slotBarInfoArr]);
}
