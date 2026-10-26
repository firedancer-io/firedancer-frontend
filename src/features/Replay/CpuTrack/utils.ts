import type { Tile } from "../../../api/types";
import { MAX_QUERY_TILES, type CpuRow } from "./const";

/**
 * Unique tile kinds, sorted alphabetically
 */
export function getTileKinds(tiles: Tile[] | undefined) {
  return [
    ...new Set((tiles ?? []).slice(0, MAX_QUERY_TILES).map(({ kind }) => kind)),
  ].sort((a, b) => a.localeCompare(b));
}

/**
 * One row per selected tile kind (mean of its tiles), or one row per tile of
 * the selected kinds if split
 */
export function getCpuRows(
  tiles: Tile[] | undefined,
  selectedKinds: string[],
  splitByTile: boolean,
): CpuRow[] {
  const rows: CpuRow[] = [];
  const rowByKind = new Map<string, CpuRow>();

  // indices are into the queried tiles, so filter after slicing
  (tiles ?? []).slice(0, MAX_QUERY_TILES).forEach(({ kind, kind_id }, i) => {
    if (!selectedKinds.includes(kind)) return;

    if (splitByTile) {
      rows.push({
        key: `${kind}:${kind_id}`,
        label: `${kind} ${kind_id}`,
        tileIdxs: [i],
      });
      return;
    }

    const row = rowByKind.get(kind);
    if (row) {
      row.tileIdxs.push(i);
    } else {
      const newRow = { key: kind, label: kind, tileIdxs: [i] };
      rowByKind.set(kind, newRow);
      rows.push(newRow);
    }
  });

  return rows;
}
