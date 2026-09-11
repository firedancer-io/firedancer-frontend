import { getDefaultStore } from "jotai";
import type { SendMessage } from "../../../api/ws/types";
import { socketStateAtom } from "../../../api/ws/atoms";
import { SocketState } from "../../../api/ws/types";
import type { NsTsRange } from "../../WebGl/webglUtils";
import {
  appendColumns,
  computeMaxima,
  emptyTxnColumns,
  parseTxnMeta,
  replayTxnMetaCacheAtom,
  rowCount,
  type TxnMetaBucket,
  type TxnMetaColumns,
  type TxnMetaMaxima,
} from "./txnMeta";
import {
  awaitTxnMetaResponse,
  failAllTxnMetaRequests,
} from "./txnMetaRequests";
import { splitFetch, type Interval } from "../splitFetch";

const CACHE_MAX_ROWS = 500_000;
const BUCKET_NS = 4_000_000_000n; // 4s
const MIN_SUB_BUCKET_NS = 1_000_000n; // 1ms
const NODE_IDX_SHIFT = 10 ** 5;

function bucketIdxOf(ns: bigint): bigint {
  return ns / BUCKET_NS;
}

function bucketWindow(id: bigint): Interval {
  const start = id * BUCKET_NS;
  return [start, start + BUCKET_NS - 1n];
}

function bucketIdxsInRange(startNs: bigint, endNs: bigint): bigint[] {
  const ids: bigint[] = [];
  for (let id = bucketIdxOf(startNs); id <= bucketIdxOf(endNs); id++)
    ids.push(id);
  return ids;
}

// Packs (bucketIdx, splitFetch nodeIdx) into one numeric id; relies on nodeIdx <
// NODE_IDX_SHIFT and bucketIdx * NODE_IDX_SHIFT staying under MAX_SAFE_INTEGER.
function bucketRequestId(bucketIdx: number, nodeIdx: number): number {
  return nodeIdx === 1 ? bucketIdx : bucketIdx * NODE_IDX_SHIFT + nodeIdx;
}

interface CachedBucket {
  txns: TxnMetaColumns;
  maxima: TxnMetaMaxima;
}

const store = getDefaultStore();
store.sub(socketStateAtom, () => {
  if (store.get(socketStateAtom) === SocketState.Disconnected) {
    failAllTxnMetaRequests("disconnected");
  }
});

/** Map iteration order is insertion order, so eviction can drop oldest-first
 *  without a separate ordering array. */
const bucketCache = new Map<bigint, CachedBucket>();
/** Cached bucket ids kept sorted by time (== numeric order), maintained by
 *  binary insert/remove so publishCache emits in time order without re-sorting
 *  the whole cache on every insert. */
const sortedKeys: bigint[] = [];
/** Running sum of rows across cached buckets; drives row-based eviction. */
let cachedRows = 0;

/** The bucket whose request is on the wire, or null. Requests are sequential,
 *  so at most one is ever in flight. */
let inFlightBucket: bigint | null = null;
/** Buckets the current view wants, left to right (replaced each round). */
let wanted: bigint[] = [];
/** Same ids as `wanted`; visible buckets are never evicted. */
let inViewSet = new Set<bigint>();
/** Buckets already launched this round, so we don't re-launch (esp. the live
 *  bucket, which needsFetch would otherwise keep re-selecting). */
const attemptedThisRound = new Set<bigint>();

/** The bucket at the live edge; mutable, unlike immutable historical buckets. */
let liveBucketIdx: bigint | null = null;
/** Incremented per requestRange to detect and discard superseded work. */
let currentRound = 0;

/** Index in sortedKeys where `key` is, or should be inserted (lower bound). */
function sortedKeyLowerBound(key: bigint): number {
  let lo = 0;
  let hi = sortedKeys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedKeys[mid] < key) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function insertSortedKey(key: bigint): void {
  sortedKeys.splice(sortedKeyLowerBound(key), 0, key);
}

function removeSortedKey(key: bigint): void {
  const idx = sortedKeyLowerBound(key);
  if (sortedKeys[idx] === key) sortedKeys.splice(idx, 1);
}

function publishCache(): void {
  const buckets: TxnMetaBucket[] = [];
  for (const id of sortedKeys) {
    const cached = bucketCache.get(id);
    if (!cached) continue;
    const [startNs, endNs] = bucketWindow(id);
    buckets.push({ startNs, endNs, txns: cached.txns, maxima: cached.maxima });
  }
  store.set(replayTxnMetaCacheAtom, buckets);
}

function evictUntilUnderRowCap(): void {
  while (cachedRows > CACHE_MAX_ROWS) {
    // Map iterates oldest-first; drop the oldest bucket not currently in view.
    let evicted: bigint | undefined;
    for (const id of bucketCache.keys()) {
      if (!inViewSet.has(id)) {
        evicted = id;
        break;
      }
    }
    if (evicted === undefined) break;
    cachedRows -= rowCount(bucketCache.get(evicted)!.txns);
    bucketCache.delete(evicted);
    removeSortedKey(evicted);
  }
}

function cacheBucket(bucketIdx: bigint, txns: TxnMetaColumns): void {
  const previous = bucketCache.get(bucketIdx);
  if (previous) {
    cachedRows -= rowCount(previous.txns);
  } else {
    insertSortedKey(bucketIdx);
  }
  cachedRows += rowCount(txns);
  bucketCache.set(bucketIdx, { txns, maxima: computeMaxima(txns) });
  publishCache();
  evictUntilUnderRowCap();
}

function fetchBucketTxns(wsSend: SendMessage, bucketIdx: bigint) {
  return splitFetch<TxnMetaColumns>(bucketWindow(bucketIdx), {
    minWindowInterval: MIN_SUB_BUCKET_NS,
    empty: emptyTxnColumns,
    merge: appendColumns,
    fetch: async ([start, end], nodeIdx) => {
      const id = bucketRequestId(Number(bucketIdx), nodeIdx);
      wsSend({
        topic: "timeline",
        key: "query_txn_meta",
        id,
        params: { start_ns: start.toString(), end_ns: end.toString() },
      });
      const result = await awaitTxnMetaResponse(id);
      return "value" in result ? { value: parseTxnMeta(result.value) } : result;
    },
  });
}

function isStaleLiveResponse(bucketIdx: bigint, round: number): boolean {
  return bucketIdx === liveBucketIdx && round !== currentRound;
}

async function fetchBucket(
  wsSend: SendMessage,
  bucketIdx: bigint,
  round: number,
): Promise<void> {
  inFlightBucket = bucketIdx;
  try {
    const { data, retriable } = await fetchBucketTxns(wsSend, bucketIdx);

    if (retriable) return;
    if (isStaleLiveResponse(bucketIdx, round)) return;

    cacheBucket(bucketIdx, data);
  } finally {
    inFlightBucket = null;
    pump(wsSend); // slot freed — pull the next wanted bucket
  }
}

function needsFetch(bucketIdx: bigint): boolean {
  if (inFlightBucket === bucketIdx || attemptedThisRound.has(bucketIdx))
    return false;
  if (bucketIdx === liveBucketIdx) return true; // always refresh the live edge
  return !bucketCache.has(bucketIdx);
}

/**
 * Launch the next wanted bucket if nothing is in flight. Requests are sequential
 * because the server batches simultaneous ones, so concurrency adds latency
 * rather than removing it. Because it re-reads `wanted` each time a
 * slot frees, buckets that leave the view between rounds are never launched —
 * rapid pan/zoom cannot pile up stale requests.
 */
function pump(wsSend: SendMessage): void {
  if (inFlightBucket !== null) return;
  const next = wanted.find(needsFetch);
  if (next === undefined) return;
  attemptedThisRound.add(next);
  void fetchBucket(wsSend, next, currentRound);
}

/** Clear all cached buckets and in-progress state. Call when the chart unmounts. */
export function resetTxnMetaCache(): void {
  // Reject in-flight requests so their late responses resolve as a transient
  // (retriable) failure and fetchBucket skips caching into the cleared state.
  failAllTxnMetaRequests("reset");
  bucketCache.clear();
  sortedKeys.length = 0;
  cachedRows = 0;
  inFlightBucket = null;
  wanted = [];
  inViewSet = new Set();
  attemptedThisRound.clear();
  liveBucketIdx = null;
  currentRound++;
  store.set(replayTxnMetaCacheAtom, []);
}

export function requestTxnMetaRange(
  wsSend: SendMessage,
  visibleRangeNs: NsTsRange,
  worldEndNs: bigint,
): void {
  const [startNs, endNs] = visibleRangeNs;
  if (endNs <= startNs) return;

  liveBucketIdx = bucketIdxOf(worldEndNs);
  currentRound++;
  attemptedThisRound.clear();

  wanted = bucketIdxsInRange(startNs, endNs);
  inViewSet = new Set(wanted);

  pump(wsSend);
}
