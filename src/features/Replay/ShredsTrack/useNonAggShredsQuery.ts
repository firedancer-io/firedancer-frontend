import { useCallback, useEffect, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useWebSocketSend } from "../../../api/ws/utils";
import { nsPerMs } from "../../../consts";
import type { NsTsRange } from "../../WebGl/webglUtils";
import type { HistoricalShreds, ShredsGranularity } from "../../../api/types";
import { ShredsGranularityEnum } from "../../../api/entities";
import { shredsAtoms } from "../../Overview/ShredsProgression/atoms";
import { useTimelineServerMessage } from "../utils";
import { timelineShredsAtoms } from "./atoms";

/** Split queries into tiles. Keep track of fetched and pending tiles */
const TILE_MS = 3000;
const TILE_NS = BigInt(TILE_MS) * BigInt(nsPerMs);

export const extraTilesCount = 1;
export const BUFFER_MS = TILE_MS * extraTilesCount;

interface TilesState {
  fetched: Set<number>;
  pending: Set<number>;
}

interface QueryBatch {
  granularity: ShredsGranularity;
  /** query id -> tile index, for pending queries */
  pendingTilesById: Map<number, number>;
  /** store responses until all queries responses for this batch are received */
  responses: HistoricalShreds[];
}

export function useReplayShredsQuery(getWorldRangeNs: () => NsTsRange) {
  const wsSend = useWebSocketSend();
  const addTimelineShreds = useSetAtom(timelineShredsAtoms.addShredEvents);
  const clearShreds = useSetAtom(timelineShredsAtoms.deleteSlots);

  const tilesRef = useRef<Record<ShredsGranularity, TilesState>>({
    [ShredsGranularityEnum.fec]: { fetched: new Set(), pending: new Set() },
    [ShredsGranularityEnum.shred]: { fetched: new Set(), pending: new Set() },
  });

  // TODO: cancel when validator disconnects
  const pendingBatchesRef = useRef<Set<QueryBatch>>(new Set());
  const nextQueryIdRef = useRef(0);

  // context of the last queryTiles call, so invalidation can re-query only the
  // tiles within the current visible (+ buffer) window
  const lastQueryRef = useRef<{
    visibleRangeNs: NsTsRange;
    granularity: ShredsGranularity;
  }>();

  const getWorldRangeNsRef = useRef(getWorldRangeNs);
  getWorldRangeNsRef.current = getWorldRangeNs;

  const flushBatchIfComplete = useCallback(
    (batch: QueryBatch) => {
      if (batch.pendingTilesById.size > 0) return;

      // batch complete: store all responses in the atom to trigger redraw
      pendingBatchesRef.current.delete(batch);
      addTimelineShreds(batch.responses);
    },
    [addTimelineShreds],
  );

  const sendTileQuery = useCallback(
    (batch: QueryBatch, tileIndex: number) => {
      tilesRef.current[batch.granularity].pending.add(tileIndex);
      const queryId = nextQueryIdRef.current++;
      batch.pendingTilesById.set(queryId, tileIndex);

      const tileStartNs = BigInt(tileIndex) * TILE_NS;
      const tileEndNs = tileStartNs + TILE_NS;
      wsSend({
        topic: "timeline",
        key: "query_shreds",
        id: queryId,
        params: {
          start_ns: tileStartNs.toString(),
          end_ns: tileEndNs.toString(),
          granularity: batch.granularity,
        },
      });
    },
    [wsSend],
  );

  const queryTileRange = useCallback(
    (firstTile: number, lastTile: number, granularity: ShredsGranularity) => {
      const tiles = tilesRef.current[granularity];

      const queryTileIdxs: number[] = [];
      for (let tileIndex = firstTile; tileIndex <= lastTile; tileIndex++) {
        if (tiles.fetched.has(tileIndex) || tiles.pending.has(tileIndex)) {
          continue;
        }
        queryTileIdxs.push(tileIndex);
      }

      if (!queryTileIdxs.length) {
        // we have all data, mark atom as ready
        addTimelineShreds([]);
        return;
      }

      const batch: QueryBatch = {
        granularity,
        pendingTilesById: new Map(),
        responses: [],
      };
      pendingBatchesRef.current.add(batch);

      for (const tileIndex of queryTileIdxs) {
        sendTileQuery(batch, tileIndex);
      }
    },
    [addTimelineShreds, sendTileQuery],
  );

  const invalidateTilesFrom = useCallback(
    (fromTileIdx: number) => {
      for (const tiles of Object.values(tilesRef.current)) {
        for (const tileIdx of tiles.fetched) {
          if (tileIdx >= fromTileIdx) tiles.fetched.delete(tileIdx);
        }
      }

      for (const batch of pendingBatchesRef.current) {
        // collect first: sendTileQuery adds new entries to pendingTilesById,
        // which would otherwise be revisited by this iteration
        const staleEntries = [...batch.pendingTilesById].filter(
          ([, tileIdx]) => tileIdx >= fromTileIdx,
        );

        for (const [queryId, tileIdx] of staleEntries) {
          // stop waiting on the stale query (its late response won't match the
          // batch), then re-query the same tile in the same batch
          batch.pendingTilesById.delete(queryId);
          tilesRef.current[batch.granularity].pending.delete(tileIdx);
          sendTileQuery(batch, tileIdx);
        }
      }
    },
    [sendTileQuery],
  );

  const queryTiles = useCallback(
    (
      visibleRangeNs: NsTsRange,
      worldRangeNs: NsTsRange,
      granularity: ShredsGranularity,
    ) => {
      const [startNs, endNs] = visibleRangeNs;
      if (endNs < startNs) return;

      // On a granularity switch, the shared slot store and per-granularity tile
      // cache fall out of sync: the store only holds one granularity per slot,
      // and already-fetched tiles would short-circuit re-querying, leaving stale
      // bars from the previous granularity. Wipe both so the new granularity
      // fetches and renders fresh.
      if (
        lastQueryRef.current &&
        lastQueryRef.current.granularity !== granularity
      ) {
        clearShreds(true, false, true);
        for (const tiles of Object.values(tilesRef.current)) {
          tiles.fetched.clear();
          tiles.pending.clear();
        }
        // drop in-flight batches so late responses from the old granularity
        // don't land in the freshly-cleared store
        pendingBatchesRef.current.clear();
      }

      lastQueryRef.current = { visibleRangeNs, granularity };

      // world tile bounds: never query outside the range where data exists
      const worldFirstTile = Number(worldRangeNs[0] / TILE_NS);
      const worldLastTile = Number(worldRangeNs[1] / TILE_NS);

      const firstTile = Math.max(
        worldFirstTile,
        Number(startNs / TILE_NS) - extraTilesCount,
      );
      const lastTile = Math.min(
        worldLastTile,
        Number(endNs / TILE_NS) + extraTilesCount,
      );

      queryTileRange(firstTile, lastTile, granularity);
    },
    [queryTileRange, clearShreds],
  );

  useTimelineServerMessage(
    "query_shreds",
    useCallback(
      (message: { id: number; value: HistoricalShreds }) => {
        const batch = [...pendingBatchesRef.current].find((b) =>
          b.pendingTilesById.has(message.id),
        );
        if (!batch) return;

        // update tile from pending -> fetched
        const tileIndex = batch.pendingTilesById.get(message.id)!;
        batch.pendingTilesById.delete(message.id);
        const tiles = tilesRef.current[batch.granularity];

        if (tiles.pending.has(tileIndex)) {
          tiles.pending.delete(tileIndex);
          tiles.fetched.add(tileIndex);
          batch.responses.push(message.value);
        }
        flushBatchIfComplete(batch);
      },
      [flushBatchIfComplete],
    ),
  );

  // When new live events land, invalidate cached tiles from that ts onwards,
  // then re-query the current visible window to fetch the latest data
  const minDirtyTs = useAtomValue(shredsAtoms.minDirtyTs);
  useEffect(() => {
    if (minDirtyTs == null) return;
    invalidateTilesFrom(Number(minDirtyTs / TILE_NS));

    const lastQuery = lastQueryRef.current;
    if (!lastQuery) return;
    queryTiles(
      lastQuery.visibleRangeNs,
      getWorldRangeNsRef.current(),
      lastQuery.granularity,
    );
  }, [minDirtyTs, invalidateTilesFrom, queryTiles]);

  return queryTiles;
}

export function getNonAggGranularity(windowSizeMs: number) {
  return windowSizeMs > 6_000
    ? ShredsGranularityEnum.fec
    : ShredsGranularityEnum.shred;
}
