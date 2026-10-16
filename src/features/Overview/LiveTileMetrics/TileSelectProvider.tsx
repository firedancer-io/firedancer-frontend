import { useCallback, useMemo, useRef, type ReactNode } from "react";
import type { Tile } from "../../../api/types";
import { areTilesEqual, getAllTileIds } from "./utils";
import {
  TileSelectContext,
  type TileSelectContextValue,
} from "./TileSelectContext";
import tableStyles from "../../../components/dataTable.module.css";

export function TileSelectProvider({ children }: { children: ReactNode }) {
  const selectedTileRef = useRef<Tile | undefined>();

  const onTileClick = useCallback((tile: Tile) => {
    if (areTilesEqual(selectedTileRef.current, tile)) {
      // deselect if clicking selected
      toggleTileSelectedClass(tile, false);
      selectedTileRef.current = undefined;
      return;
    }

    if (selectedTileRef.current) {
      // deselect previously selected
      toggleTileSelectedClass(selectedTileRef.current, false);
    }

    selectedTileRef.current = tile;
    toggleTileSelectedClass(selectedTileRef.current, true);
  }, []);

  const syncSelectedClass = useCallback((tile: Tile) => {
    // sync states if row was remounted
    const isSelected = areTilesEqual(selectedTileRef.current, tile);
    toggleTileSelectedClass(tile, isSelected);
  }, []);

  const value = useMemo<TileSelectContextValue>(
    () => ({ onTileClick, syncSelectedClass }),
    [onTileClick, syncSelectedClass],
  );

  return (
    <TileSelectContext.Provider value={value}>
      {children}
    </TileSelectContext.Provider>
  );
}

function toggleTileSelectedClass(tile: Tile, isSelected: boolean) {
  for (const id of getAllTileIds(tile)) {
    document
      .getElementById(id)
      ?.classList.toggle(tableStyles.selected, isSelected);
  }
}
