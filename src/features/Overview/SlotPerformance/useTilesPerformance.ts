import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { tilesAtom } from "../../../api/atoms";
import { useSlotQueryResponseDetailed } from "../../../hooks/useSlotQuery";
import {
  groupedLiveIdlePerTileAtom,
  selectedSlotAtom,
  tileCountAtom,
} from "./atoms";

export function useTilesPerformance() {
  const slot = useAtomValue(selectedSlotAtom);
  const showLive = !slot;
  const tiles = useAtomValue(tilesAtom);
  const tileCounts = useAtomValue(tileCountAtom);
  const groupedLiveIdlePerTile = useAtomValue(groupedLiveIdlePerTileAtom);

  const query = useSlotQueryResponseDetailed(slot);

  const queryIdleData = useMemo(() => {
    if (!query.response?.tile_timers?.length || showLive || !tiles) return;

    return query.response.tile_timers.reduce<Record<string, number[][]>>(
      (aggTimerPerTileType, timers) => {
        if (!timers.tile_timers.length) return aggTimerPerTileType;
        const idleTimersPerTileType: Record<string, number[]> = {};

        if (timers.tile_timers.length !== tiles.length) {
          console.warn(
            "Length mismatch between tiles and time timers",
            timers.tile_timers,
            tiles,
          );
        }

        for (let i = 0; i < timers.tile_timers.length; i++) {
          const timer = timers.tile_timers[i];

          const tile = tiles[i];
          if (!tile) continue;

          idleTimersPerTileType[tile.kind] ??= [];
          idleTimersPerTileType[tile.kind].push(timer);
        }

        for (const [tile, idlePerTile] of Object.entries(
          idleTimersPerTileType,
        )) {
          aggTimerPerTileType[tile] ??= [];
          aggTimerPerTileType[tile].push(idlePerTile);
        }

        return aggTimerPerTileType;
      },
      {},
    );
  }, [query.response?.tile_timers, showLive, tiles]);

  return {
    tileCounts,
    groupedLiveIdlePerTile,
    showLive,
    queryIdleData,
  };
}
