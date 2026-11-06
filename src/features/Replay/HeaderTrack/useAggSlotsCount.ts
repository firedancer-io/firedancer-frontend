import { getDefaultStore } from "jotai";
import { useEffect, useState } from "react";
import type { AggGranularity } from "../../../api/types";
import {
  aggHeaderEmitterAtom,
  aggSlotsAtom,
  drawEventType,
  type SlotCounts,
} from "./aggAtoms";

const store = getDefaultStore();

function readSlotCounts(granularity: AggGranularity, bucketIdx: number) {
  return store.get(aggSlotsAtom).get(granularity)?.get(bucketIdx);
}

export function useAggSlotsCount(
  granularity: AggGranularity,
  bucketIdx: number,
): SlotCounts | undefined {
  const [slotCounts, setSlotCounts] = useState(() =>
    readSlotCounts(granularity, bucketIdx),
  );

  useEffect(() => {
    setSlotCounts(readSlotCounts(granularity, bucketIdx));

    const emitter = store.get(aggHeaderEmitterAtom);
    const onDraw = () => setSlotCounts(readSlotCounts(granularity, bucketIdx));
    emitter.addListener(drawEventType, onDraw);
    return () => {
      emitter.removeListener(drawEventType, onDraw);
    };
  }, [granularity, bucketIdx]);

  return slotCounts;
}
