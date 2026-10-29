import { getDefaultStore, type Atom } from "jotai";
import { useEffect, useState } from "react";
import type { AggGranularity } from "../../api/types";
import { drawEventType, type DrawEmitter } from "./const";

const store = getDefaultStore();

function readBucket<T>(
  bucketsAtom: Atom<Map<AggGranularity, Map<number, T>>>,
  granularity: AggGranularity,
  bucketIdx: number,
) {
  return store.get(bucketsAtom).get(granularity)?.get(bucketIdx);
}

/**
 * read one agg bucket's value, updating on draw emits.
 */
export function useAggBucket<T>(
  bucketsAtom: Atom<Map<AggGranularity, Map<number, T>>>,
  emitterAtom: Atom<DrawEmitter>,
  granularity: AggGranularity,
  bucketIdx: number,
): T | undefined {
  const [value, setValue] = useState(() =>
    readBucket(bucketsAtom, granularity, bucketIdx),
  );

  useEffect(() => {
    setValue(readBucket(bucketsAtom, granularity, bucketIdx));

    const emitter = store.get(emitterAtom);
    const onDraw = () =>
      setValue(readBucket(bucketsAtom, granularity, bucketIdx));
    emitter.addListener(drawEventType, onDraw);
    return () => {
      emitter.removeListener(drawEventType, onDraw);
    };
  }, [bucketsAtom, emitterAtom, granularity, bucketIdx]);

  return value;
}
