import { getDefaultStore, type Atom } from "jotai";
import { useEffect, useState } from "react";
import type { AggGranularity } from "../../api/types";
import { drawEventType, type DrawEmitter } from "./const";
import {
  getDrawnBucket,
  type BucketOverlap,
  type GetDrawTiles,
} from "./aggDraw";

const store = getDefaultStore();

function readBucket<T>(
  bucketsAtom: Atom<Map<AggGranularity, Map<number, T>>>,
  drawTilesAtom: Atom<GetDrawTiles | undefined>,
  resample: (overlaps: BucketOverlap<T>[]) => T,
  granularity: AggGranularity,
  bucketIdx: number,
) {
  const getDrawTiles = store.get(drawTilesAtom);
  if (!getDrawTiles) return;
  return getDrawnBucket(
    getDrawTiles,
    granularity,
    bucketIdx,
    store.get(bucketsAtom),
    resample,
  );
}

/**
 * read one agg bucket's drawn value, updating on draw emits.
 */
export function useAggBucket<T>(
  bucketsAtom: Atom<Map<AggGranularity, Map<number, T>>>,
  emitterAtom: Atom<DrawEmitter>,
  drawTilesAtom: Atom<GetDrawTiles | undefined>,
  resample: (overlaps: BucketOverlap<T>[]) => T,
  granularity: AggGranularity,
  bucketIdx: number,
): T | undefined {
  const [value, setValue] = useState(() =>
    readBucket(bucketsAtom, drawTilesAtom, resample, granularity, bucketIdx),
  );

  useEffect(() => {
    const onDraw = () =>
      setValue(
        readBucket(
          bucketsAtom,
          drawTilesAtom,
          resample,
          granularity,
          bucketIdx,
        ),
      );
    onDraw();

    const emitter = store.get(emitterAtom);
    emitter.addListener(drawEventType, onDraw);
    return () => {
      emitter.removeListener(drawEventType, onDraw);
    };
  }, [
    bucketsAtom,
    emitterAtom,
    drawTilesAtom,
    resample,
    granularity,
    bucketIdx,
  ]);

  return value;
}
