import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMount } from "react-use";
import { useWebSocketSend } from "../../../api/ws/utils";
import { getIsFutureSlotAtom } from "../../../atoms";
import { useThrottledCallback } from "use-debounce";
import {
  gossipPeersRowsUpdateAtom,
  gossipPeersCellUpdateAtom,
} from "../../../api/atoms";
import type { GossipPeersCellData } from "../../../api/types";

type SortOrder = -1 | 0 | 1;

export default function usePeerTableQuery() {
  const wsSend = useWebSocketSend();
  const updatedRows = useAtomValue(gossipPeersRowsUpdateAtom);
  const updatedCells = useAtomValue(gossipPeersCellUpdateAtom);
  const rowsCacheRef = useRef(
    new Map<string, Record<string, GossipPeersCellData>>(),
  );

  const [cols, setCols] = useState<string[]>([]);
  const [colSorting, setColSorting] = useState<SortOrder[]>([]);

  useEffect(() => {
    if (!updatedRows) return;

    const rows = Object.entries(updatedRows);

    // set initial col state
    if (!cols.length && rows[0]?.[1]) {
      const newCols = Object.keys(rows[0][1]);
      setCols(newCols);
      setColSorting(Array.from({ length: newCols.length }).map(() => -1));
    }

    rows.forEach(([rowIdx, row]) => {
      rowsCacheRef.current.set(rowIdx, row);
    });
  }, [cols, updatedRows]);

  useEffect(() => {
    if (!updatedCells) return;

    for (const cell of updatedCells.changes) {
      const row = rowsCacheRef.current.get(cell.row_index.toString());
      if (row) {
        row[cell.column_name] = cell.new_value;
      }
    }

    // rows.forEach(([rowIdx, row]) => {
    // });
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
      const colIdIdx = cols?.indexOf(colId);
      if (colIdIdx !== undefined) {
        setColSorting((colSorting) => {
          const colDir = (colSorting[colIdIdx] * -1) as SortOrder;
          const newColSorting = [...colSorting];
          newColSorting[colIdIdx] = colDir;

          const restOfCols = cols.filter((col) => col !== colId);
          const restOfColsSort = new Array(restOfCols.length).fill(
            0,
          ) as SortOrder[];

          const params = {
            col: [colId, ...restOfCols],
            dir: [colDir, ...restOfColsSort],
          };
          wsSend({
            topic: "gossip",
            key: "query_sort",
            id: 32,
            params,
          });

          return newColSorting;
        });
      }
    },
    [cols, wsSend],
  );

  return { query, sort, cols, rowsCacheRef };
}
