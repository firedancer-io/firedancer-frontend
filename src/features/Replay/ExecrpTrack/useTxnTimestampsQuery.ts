import { useCallback, useEffect, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  replayTxnTimestampsResponseAtom,
  replayTxnTimestampsErrorAtom,
} from "../../../api/atoms";
import { useWebSocketSend } from "../../../api/ws/utils";
import { logDebug } from "../../../logger";
import type { NsTsRange } from "../../WebGl/webglUtils";
import {
  appendTxnTimestamps,
  emptyTxnTimestampColumns,
  replayTxnTimestampsCacheAtom,
  type TxnTimestampBucket,
  type TxnTimestampColumns,
} from "./txnTimestamps";

const BUCKET_NS = 4_000_000_000n;
const CACHE_MAX_BUCKETS = 16;
const MIN_SUBWINDOW_NS = 1_000_000n; // 1ms
const QUERY_TIMEOUT_MS = 15_000;
const RESULT_LIMIT_EXCEEDED = "result_limit_exceeded";

function bucketIdOf(ns: bigint): bigint {
  return ns / BUCKET_NS;
}

function bucketWindow(id: bigint): [bigint, bigint] {
  const start = id * BUCKET_NS;
  return [start, start + BUCKET_NS - 1n];
}

type Interval = [start: bigint, end: bigint];

interface BucketRun {
  bucketId: bigint;
  pending: Interval[];
  current: Interval | null;
  txns: TxnTimestampColumns;
  errorCode: string | undefined;
}

interface CachedBucket {
  txns: TxnTimestampColumns;
}

export default function useTxnTimestampsQuery() {
  const wsSend = useWebSocketSend();
  const setCache = useSetAtom(replayTxnTimestampsCacheAtom);
  const setResponse = useSetAtom(replayTxnTimestampsResponseAtom);
  const setError = useSetAtom(replayTxnTimestampsErrorAtom);
  const response = useAtomValue(replayTxnTimestampsResponseAtom);
  const error = useAtomValue(replayTxnTimestampsErrorAtom);

  const bucketCacheRef = useRef<Map<bigint, CachedBucket>>(new Map());
  const orderRef = useRef<bigint[]>([]);
  const neededRef = useRef<Set<bigint>>(new Set());
  const neededOrderRef = useRef<bigint[]>([]);
  const liveBucketIdRef = useRef<bigint | null>(null);
  const attemptedThisRoundRef = useRef<Set<bigint>>(new Set());

  const runRef = useRef<BucketRun | null>(null);
  const requestIdRef = useRef(0);
  const completedIdRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const publishCache = useCallback(() => {
    const buckets: TxnTimestampBucket[] = [];
    for (const id of orderRef.current) {
      const bucket = bucketCacheRef.current.get(id);
      if (!bucket) continue;
      const [startNs, endNs] = bucketWindow(id);
      buckets.push({ startNs, endNs, txns: bucket.txns });
    }
    buckets.sort((a, b) =>
      a.startNs < b.startNs ? -1 : a.startNs > b.startNs ? 1 : 0,
    );
    setCache(buckets);
  }, [setCache]);

  const evict = useCallback(() => {
    const cap = Math.max(CACHE_MAX_BUCKETS, neededRef.current.size);
    while (orderRef.current.length > cap) {
      const idx = orderRef.current.findIndex(
        (id) => !neededRef.current.has(id),
      );
      if (idx === -1) break;
      const [removed] = orderRef.current.splice(idx, 1);
      bucketCacheRef.current.delete(removed);
    }
  }, []);

  const sendCurrent = useCallback(
    (run: BucketRun) => {
      const window = run.pending.pop();
      if (!window) return;
      run.current = window;
      requestIdRef.current++;
      const reqId = requestIdRef.current;

      setResponse(undefined);
      setError(undefined);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        if (requestIdRef.current === reqId) setError("timeout");
      }, QUERY_TIMEOUT_MS);

      const message = {
        topic: "timeline",
        key: "query_txn_timestamps",
        id: 34,
        params: {
          start_ns: window[0].toString(),
          end_ns: window[1].toString(),
          // "txn" = one row per transaction; "txn_batch" aggregates per batch.
          granularity: "txn",
        },
      };
      logDebug(
        "txnTimestamps",
        `send bucket ${run.bucketId} [${window[0]}, ${window[1]}] reqId=${reqId}`,
        message,
      );
      wsSend(message);
    },
    [wsSend, setResponse, setError],
  );

  const needsFetch = useCallback((id: bigint) => {
    if (attemptedThisRoundRef.current.has(id)) return false;
    if (id === liveBucketIdRef.current) return true;
    return !bucketCacheRef.current.has(id);
  }, []);

  const startNextBucket = useCallback(() => {
    const next = neededOrderRef.current.find(needsFetch);
    if (next === undefined) {
      runRef.current = null;
      return;
    }
    attemptedThisRoundRef.current.add(next);
    const run: BucketRun = {
      bucketId: next,
      pending: [bucketWindow(next)],
      current: null,
      txns: emptyTxnTimestampColumns(),
      errorCode: undefined,
    };
    runRef.current = run;
    sendCurrent(run);
  }, [needsFetch, sendCurrent]);

  const requestRange = useCallback(
    (visibleRangeNs: NsTsRange, worldEndNs: bigint) => {
      const [startNs, endNs] = visibleRangeNs;
      if (endNs <= startNs) return;

      liveBucketIdRef.current = bucketIdOf(worldEndNs);
      attemptedThisRoundRef.current = new Set();

      const firstId = bucketIdOf(startNs);
      const lastId = bucketIdOf(endNs);
      const needed = new Set<bigint>();
      const ids: bigint[] = [];
      for (let id = firstId; id <= lastId; id++) {
        needed.add(id);
        ids.push(id);
      }
      const centreNs = (startNs + endNs) / 2n;
      ids.sort((a, b) => {
        const da = a * BUCKET_NS + BUCKET_NS / 2n - centreNs;
        const db = b * BUCKET_NS + BUCKET_NS / 2n - centreNs;
        const absA = da < 0n ? -da : da;
        const absB = db < 0n ? -db : db;
        return absA < absB ? -1 : absA > absB ? 1 : 0;
      });
      neededRef.current = needed;
      neededOrderRef.current = ids;
      logDebug(
        "txnTimestamps",
        `range: ${ids.length} buckets needed, inFlight=${!!runRef.current}`,
      );

      if (!runRef.current) startNextBucket();
    },
    [startNextBucket],
  );

  useEffect(() => {
    const run = runRef.current;
    if (!run || !run.current) return;

    const settled = response !== undefined || error !== undefined;
    if (!settled) return;
    if (completedIdRef.current === requestIdRef.current) return;
    completedIdRef.current = requestIdRef.current;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const [start, end] = run.current;

    if (error === RESULT_LIMIT_EXCEEDED) {
      const mid = start + (end - start) / 2n;
      const splittable = end - start > MIN_SUBWINDOW_NS && mid > start;
      if (splittable) {
        run.pending.push([mid + 1n, end]);
        run.pending.push([start, mid]);
        run.current = null;
        logDebug(
          "txnTimestamps",
          `split bucket ${run.bucketId} [${start}, ${end}]`,
        );
        sendCurrent(run);
        return;
      }
      run.errorCode = RESULT_LIMIT_EXCEEDED;
    } else if (error !== undefined) {
      run.errorCode = error;
      logDebug(
        "txnTimestamps",
        `error bucket ${run.bucketId} [${start}, ${end}]: ${error}`,
      );
    } else if (response !== undefined) {
      appendTxnTimestamps(run.txns, response);
    }

    run.current = null;

    if (run.pending.length > 0) {
      sendCurrent(run);
      return;
    }

    const gotTxns = run.txns.txn_exec_idx.length > 0;
    if (run.errorCode && !gotTxns) {
      logDebug(
        "txnTimestamps",
        `bucket ${run.bucketId} failed (${run.errorCode}), will retry next round`,
      );
    } else {
      if (!bucketCacheRef.current.has(run.bucketId)) {
        orderRef.current.push(run.bucketId);
      }
      bucketCacheRef.current.set(run.bucketId, { txns: run.txns });
      publishCache();
      evict();
    }

    runRef.current = null;
    startNextBucket();
  }, [response, error, sendCurrent, publishCache, evict, startNextBucket]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return requestRange;
}
