import { getDefaultStore, type Atom } from "jotai";
import { useEffect, useState } from "react";
import type { AggGranularity } from "../../api/types";
import { drawEventType, type DrawEmitter } from "./useAggQuery";

const store = getDefaultStore();

/**
 * Build a hook that reactively reads one agg bucket's value, updating on emits
 */
export function makeAggBucketHook<T>(
  bucketsAtom: Atom<Map<AggGranularity, Map<number, T>>>,
  emitterAtom: Atom<DrawEmitter>,
) {
  function read(granularity: AggGranularity, bucketIdx: number) {
    return store.get(bucketsAtom).get(granularity)?.get(bucketIdx);
  }

  return function useAggBucket(
    granularity: AggGranularity,
    bucketIdx: number,
  ): T | undefined {
    const [value, setValue] = useState(() => read(granularity, bucketIdx));

    useEffect(() => {
      setValue(read(granularity, bucketIdx));

      const emitter = store.get(emitterAtom);
      const onDraw = () => setValue(read(granularity, bucketIdx));
      emitter.addListener(drawEventType, onDraw);
      return () => {
        emitter.removeListener(drawEventType, onDraw);
      };
    }, [granularity, bucketIdx]);

    return value;
  };
}
