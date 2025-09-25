import { useAtomValue } from "jotai";
import { Flex, Text } from "@radix-ui/themes";
import { useMemo } from "react";
import { tilesAtom } from "../../../../api/atoms";
import { tileTypeSchema } from "../../../../api/entities";
import type { TileType } from "../../../../api/types";
import { useSlotQueryResponseDetailed } from "../../../../hooks/useSlotQuery";
import {
  liveTileTimerfallAtom,
  selectedSlotAtom,
  tileCountAtom,
} from "../../../Overview/SlotPerformance/atoms";
import TileCard from "../../../Overview/SlotPerformance/TileCard";

export default function CpuSparklines() {
  const liveTileTimers = useAtomValue(liveTileTimerfallAtom);
  const slot = useAtomValue(selectedSlotAtom);
  const showLive = !slot;
  const tiles = useAtomValue(tilesAtom);
  const tileCounts = useAtomValue(tileCountAtom);

  const groupedLiveIdlePerTile = liveTileTimers?.reduce<
    Record<TileType, number[]>
  >(
    (grouped, timer, i) => {
      const tile = tiles?.[i];
      if (!tile) return grouped;

      const parsedTileKind = tileTypeSchema.safeParse(tile.kind);
      if (parsedTileKind.error) {
        return grouped;
      }

      grouped[parsedTileKind.data] ??= [];
      grouped[parsedTileKind.data].push(timer);

      return grouped;
    },
    {} as Record<TileType, number[]>,
  );

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

  return (
    <Flex direction="column" gap="2">
      <Text style={{ color: "var(--gray-12)" }}>CPU</Text>

      <TileCard
        header="pack"
        tileCount={tileCounts["pack"]}
        liveIdlePerTile={groupedLiveIdlePerTile?.["pack"]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.["pack"]}
        statLabel="Full"
        metricType="pack"
        includeBg={false}
      />
      <TileCard
        header="bank"
        tileCount={tileCounts["bank"]}
        liveIdlePerTile={groupedLiveIdlePerTile?.["bank"]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.["bank"]}
        statLabel="TPS"
        metricType="bank"
        includeBg={false}
      />
    </Flex>
  );
}
