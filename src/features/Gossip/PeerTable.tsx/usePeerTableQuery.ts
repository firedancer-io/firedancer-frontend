import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocketSend } from "../../../api/ws/utils";
import {
  gossipPeersRowsUpdateAtom,
  gossipPeersCellUpdateAtom,
} from "../../../api/atoms";
import type { GossipPeersCellData } from "../../../api/types";

export type SortOrder = -1 | 0 | 1;
const defaultSorting = { id: "Stake", direction: -1 } as const;

export default function usePeerTableQuery() {
  const wsSend = useWebSocketSend();
  const updatedRows = useAtomValue(gossipPeersRowsUpdateAtom);
  const updatedCells = useAtomValue(gossipPeersCellUpdateAtom);
  const rowsCacheRef = useRef(
    new Map<string, Record<string, GossipPeersCellData>>(),
  );

  const [colIds, setColIds] = useState<string[]>([]);
  const [colSorting, setColSorting] = useState<{
    id: string;
    direction: SortOrder;
  }>(defaultSorting);

  useEffect(() => {
    if (!updatedRows) return;

    const rows = Object.entries(updatedRows);
    // set initial col state
    if (!colIds.length && rows[0]?.[1]) {
      const newColIds = Object.keys(rows[0][1]);
      setColIds(newColIds);
      setColSorting(defaultSorting);
    }

    for (const [rowIdx, row] of rows) {
      rowsCacheRef.current.set(rowIdx, row);
    }
  }, [colIds, updatedRows]);

  useEffect(() => {
    if (!updatedCells) return;

    for (const cell of updatedCells.changes) {
      const row = rowsCacheRef.current.get(cell.row_index.toString());
      if (row) {
        row[cell.column_name] = cell.new_value;
      }
    }
  }, [updatedCells]);

  const query = useCallback(
    (startRow: number, endRow: number) => {
      if (endRow < startRow) return;
      if (startRow < 0) return;

      const params = {
        start_row: startRow,
        row_cnt: endRow - startRow,
      };

      wsSend({
        topic: "gossip",
        key: "query_scroll",
        id: 16,
        params,
      });
    },
    [wsSend],
  );

  const sort = useCallback(
    (colId: string) => {
      const colIdIdx = colIds?.indexOf(colId);
      if (colIdIdx !== undefined) {
        setColSorting((prev) => {
          let direction: SortOrder = -1;
          if (prev.id === colId) {
            direction = -prev.direction as SortOrder;
          }
          const restOfCols = colIds.filter((col) => col !== colId);
          const restOfColsSort = new Array(restOfCols.length).fill(
            0,
          ) as SortOrder[];

          const params = {
            col: [colId, ...restOfCols],
            dir: [direction, ...restOfColsSort],
          };
          wsSend({
            topic: "gossip",
            key: "query_sort",
            id: 32,
            params,
          });

          return { id: colId, direction };
        });
      }
    },
    [colIds, wsSend],
  );

  return { query, sort, colIds, rowsCacheRef, colSorting };
}
