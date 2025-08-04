import styles from "./tilesPerformance.module.css";
import TileCard from "./TileCard";
import { useAtomValue } from "jotai";
import { tilesAtom } from "../../../api/atoms";
import {
  liveTileTimerfallAtom,
  selectedSlotAtom,
  tileCountAtom,
} from "./atoms";
import { useMemo } from "react";
import type { TileType } from "../../../api/types";
import { tileTypeSchema } from "../../../api/entities";
import { useSlotQueryResponseDetailed } from "../../../hooks/useSlotQuery";

export default function TilesPerformance() {
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

  const netType = tileCounts["net"] ? "net" : "sock";

  return (
    <div className={styles.container}>
      <TileCard
        header={netType}
        subHeader="(in)"
        tileCount={tileCounts[netType]}
        liveIdlePerTile={groupedLiveIdlePerTile?.[netType]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.[netType]}
        statLabel="Ingress"
        metricType="net_in"
      />
      <TileCard
        header="QUIC"
        tileCount={tileCounts["quic"]}
        liveIdlePerTile={groupedLiveIdlePerTile?.["quic"]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.["quic"]}
        statLabel="Conns"
        metricType="quic"
      />
      <TileCard
        header="verify"
        tileCount={tileCounts["verify"]}
        liveIdlePerTile={groupedLiveIdlePerTile?.["verify"]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.["verify"]}
        statLabel="Failed"
        metricType="verify"
      />
      <TileCard
        header="dedup"
        tileCount={tileCounts["dedup"]}
        liveIdlePerTile={groupedLiveIdlePerTile?.["dedup"]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.["dedup"]}
        statLabel="Dupes"
        metricType="dedup"
      />
      <TileCard
        header="resolv"
        tileCount={tileCounts["resolv"]}
        liveIdlePerTile={groupedLiveIdlePerTile?.["resolv"]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.["resolv"]}
        statLabel="Resolv"
      />
      <TileCard
        header="pack"
        tileCount={tileCounts["pack"]}
        liveIdlePerTile={groupedLiveIdlePerTile?.["pack"]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.["pack"]}
        statLabel="Full"
        metricType="pack"
      />
      <TileCard
        header="bank"
        tileCount={tileCounts["bank"]}
        liveIdlePerTile={groupedLiveIdlePerTile?.["bank"]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.["bank"]}
        statLabel="TPS"
        metricType="bank"
      />
      <TileCard
        header="poh"
        tileCount={tileCounts["poh"]}
        liveIdlePerTile={groupedLiveIdlePerTile?.["poh"]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.["poh"]}
        statLabel="Hash"
        // metricType="poh"
      />
      <TileCard
        header="shred"
        tileCount={tileCounts["shred"]}
        liveIdlePerTile={groupedLiveIdlePerTile?.["shred"]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.["shred"]}
        statLabel="Shreds"
        // metricType="shred"
      />
      <TileCard
        header="store"
        tileCount={tileCounts["store"]}
        liveIdlePerTile={groupedLiveIdlePerTile?.["store"]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.["store"]}
        statLabel="Latency"
        // metricType="store"
      />
      <TileCard
        header={netType}
        subHeader="(out)"
        tileCount={tileCounts[netType]}
        liveIdlePerTile={groupedLiveIdlePerTile?.[netType]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.[netType]}
        statLabel="Egress" // mbs
        metricType="net_out"
      />
    </div>
  );
}
