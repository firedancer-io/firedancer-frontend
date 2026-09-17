import { createContext, useContext } from "react";
import type { Tile } from "../../../api/types";

export interface TileSelectContextValue {
  onTileClick: (tile: Tile) => void;
  syncSelectedClass: (tile: Tile) => void;
}

export const TileSelectContext = createContext<TileSelectContextValue | null>(
  null,
);

export function useTileSelect() {
  const ctx = useContext(TileSelectContext);
  if (!ctx) {
    throw new Error("useTileSelect must be used within a TileSelectProvider");
  }
  return ctx;
}
