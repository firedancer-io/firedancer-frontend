import { useEffect, useMemo } from "react";
import tableStyles from "../../../components/dataTable.module.css";
import { getPinnedRowId, getRowIds, getUnpinnedRowId } from "./utils";
import type { Tile } from "../../../api/types";

export interface SelectTileProps {
  id: string;
  onClick: () => void;
}

export function toggleTileSelectedClass(tile: Tile, isSelected: boolean) {
  for (const id of getRowIds(tile)) {
    document
      .getElementById(id)
      ?.classList.toggle(tableStyles.selected, isSelected);
  }
}

export function useTileSelect(
  isPinned: boolean,
  tile: Tile,
  initSelectedClass: (tile: Tile) => void,
  selectTile: (tile: Tile) => void,
): SelectTileProps {
  // re-sync selected state on mount / tile change
  useEffect(() => {
    initSelectedClass(tile);
  }, [initSelectedClass, tile]);

  return useMemo(
    () => ({
      id: isPinned ? getPinnedRowId(tile) : getUnpinnedRowId(tile),
      onClick: () => selectTile(tile),
    }),
    [isPinned, selectTile, tile],
  );
}
