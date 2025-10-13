import { useAtomValue } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ListRange } from "react-virtuoso";
import { TableVirtuoso } from "react-virtuoso";
import {
  gossipPeersCellUpdateAtom,
  gossipPeersRowsUpdateAtom,
  gossipPeersSizeAtom,
} from "../../../api/atoms";
import usePeerTableQuery from "./usePeerTableQuery";
import type { GossipPeersCellData } from "../../../api/types";
import { cardBackgroundColor } from "../../../colors";

const rowHeight = 20;
const defaultSize = 1_000;
const buffer = 0;

const minWidths: Record<string, number> = {
  Pubkey: 400,
  ["IP Addr"]: 160,
};

export default function PeerTable() {
  const size = useAtomValue(gossipPeersSizeAtom) ?? defaultSize;

  const { query, sort, cols, rowsCacheRef } = usePeerTableQuery();

  const onRangeChanged = useCallback(
    ({ startIndex, endIndex }: ListRange) => {
      const start = Math.max(0, startIndex - buffer);
      const end = Math.min(
        endIndex + buffer,
        size > 0 ? size - 1 : endIndex + buffer,
      );
      query(start, end);
    },
    [query, size],
  );

  return (
    <>
      <TableVirtuoso
        totalCount={size}
        increaseViewportBy={100}
        rangeChanged={onRangeChanged}
        itemContent={(index) => {
          const row = rowsCacheRef.current?.get(index.toString());
          if (!row) {
            // Placeholder skeleton while loading
            return (
              <>
                <td
                  // style={{ height: rowHeight }}
                  colSpan={5}
                >
                  Loading…
                </td>
              </>
            );
          }

          const cellData = Object.entries(row);
          return (
            <>
              {cellData.map(([colId, data]) => {
                const minWidth = minWidths[colId];
                return <td key={colId}>{data}</td>;
              })}
            </>
          );
        }}
        fixedHeaderContent={() => (
          <tr style={{ background: cardBackgroundColor }}>
            {cols?.map((colId) => {
              const minWidth = minWidths[colId];
              return (
                <th
                  key={colId}
                  onClick={() => sort(colId)}
                  style={{ minWidth, padding: "0 8px" }}
                >
                  {colId}
                </th>
              );
            })}
          </tr>
        )}
        // computeItemKey={(index) => {
        //   const row = rowsCacheRef.current.get(index.toString());
        //   return row?.id ?? `placeholder-${index}`;
        // }}
        style={{ height: 300 }}
      />
    </>
  );
}
