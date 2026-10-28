import { getDefaultStore, type Atom, type WritableAtom } from "jotai";
import type TypedEmitter from "typed-emitter";
import { sendMessage } from "../../api/worker/useWsWorker";
import type { AggGranularity } from "../../api/types";
import type { NsTsRange, TsRange } from "../WebGl/webglUtils";
import { calcAbsoluteNs, subscribeToTimelineMessages } from "./utils";
import { createParallelCache } from "./parallelCache";
import { nsBucketSizes } from "./const";
import type { TimelineQueryKey } from "./atoms";

const store = getDefaultStore();

const drawEventType = "draw";

/**
 * Number of current granularity buckets per fetch tile.
 * The tile ns size increases as a bucket size increases.
 */
export const BUCKETS_PER_TILE = 250;
export const OVERSCAN_TILES_COUNT = 2;
export const OVERSCAN_BUCKETS = BUCKETS_PER_TILE * OVERSCAN_TILES_COUNT;
const TILE_EVICTION_HIGH_WATERMARK = 24;
const TILE_EVICTION_LOW_WATERMARK = 16;
const getTileEvictionHighWatermark = () => TILE_EVICTION_HIGH_WATERMARK;
const getTileEvictionLowWatermark = () => TILE_EVICTION_LOW_WATERMARK;

export function getTileSizeNs(granularity: AggGranularity) {
  return BigInt(BUCKETS_PER_TILE) * nsBucketSizes[granularity];
}

type DrawEmitter = TypedEmitter<{ [drawEventType]: () => void }>;

type AddAtom<TValue> = WritableAtom<null, [TValue], void>;

type DeleteBucketsAtom = WritableAtom<null, [AggGranularity, number[]], void>;

interface CreateAggCacheOpts<TValue> {
  chartId: string;
  queryKey: TimelineQueryKey;
  addAtom: AddAtom<TValue>;
  deleteBucketsAtom: DeleteBucketsAtom;
  emitterAtom: Atom<DrawEmitter>;
}

export function createAggCache<TValue>({
  chartId,
  queryKey,
  addAtom,
  deleteBucketsAtom,
  emitterAtom,
}: CreateAggCacheOpts<TValue>) {
  const emitter = store.get(emitterAtom);

  const sendQuery = (
    queryId: number,
    startNs: bigint,
    endNs: bigint,
    granularity: AggGranularity,
  ) => {
    sendMessage({
      topic: "timeline",
      key: queryKey,
      id: queryId,
      params: {
        start_ns: startNs.toString(),
        end_ns: endNs.toString(),
        granularity,
      },
    });
  };

  const onEvictTiles = (granularity: AggGranularity, tileIdxs: number[]) => {
    const bucketIdxs = tileIdxs.reduce<number[]>((acc, tileIdx) => {
      const start = tileIdx * BUCKETS_PER_TILE;
      const end = start + BUCKETS_PER_TILE;
      for (let i = start; i < end; i++) {
        acc.push(i);
      }
      return acc;
    }, []);
    store.set(deleteBucketsAtom, granularity, bucketIdxs);
  };

  const {
    queryRange,
    markQueryComplete,
    pauseStaleRefreshes,
    dispose: disposeParallelCache,
  } = createParallelCache<AggGranularity>({
    chartId,
    getTileSizeNs,
    overscanTilesCount: OVERSCAN_TILES_COUNT,
    queryKey,
    sendQuery,
    getTileEvictionHighWatermark,
    getTileEvictionLowWatermark,
    onEvictTiles,
  });

  let unsubscribe: (() => void) | undefined;

  const init = () => {
    unsubscribe?.();
    unsubscribe = subscribeToTimelineMessages(queryKey, (message) => {
      if (!markQueryComplete(message.id)) return;

      store.set(addAtom, message.value as TValue);
    });
  };

  // trigger redraw if panning to already fetched data
  const onNothingToFetch = () => {
    emitter.emit(drawEventType);
  };

  const query = (
    referenceNs: bigint,
    visibleRange: TsRange,
    worldRange: TsRange,
    granularity: AggGranularity,
  ) => {
    const visibleRangeNs: NsTsRange = [
      calcAbsoluteNs(referenceNs, visibleRange[0]),
      calcAbsoluteNs(referenceNs, visibleRange[1]),
    ];

    const worldRangeNs: NsTsRange = [
      calcAbsoluteNs(referenceNs, worldRange[0]),
      calcAbsoluteNs(referenceNs, worldRange[1]),
    ];
    queryRange(visibleRangeNs, worldRangeNs, granularity, onNothingToFetch);
  };

  const dispose = () => {
    unsubscribe?.();
    unsubscribe = undefined;
    disposeParallelCache();
  };

  return { query, pauseStaleRefreshes, init, dispose };
}
