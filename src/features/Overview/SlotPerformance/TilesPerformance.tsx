import styles from "./tilesPerformance.module.css";
import TileCard from "./TileCard";
import { useAtomValue } from "jotai";
import { tilesAtom } from "../../../api/atoms";
import { countBy } from "lodash";
import { liveTileTimerfallAtom, selectedSlotAtom } from "./atoms";
import { useMemo } from "react";
import useSlotQuery from "../../../hooks/useSlotQuery";
import { TileType } from "../../../api/types";

export default function TilesPerformance() {
  const liveTileTimers = useAtomValue(liveTileTimerfallAtom);
  const slot = useAtomValue(selectedSlotAtom);
  const showLive = !slot;

  const tiles = useAtomValue(tilesAtom);
  const tileCounts = countBy(tiles, (t) => t.kind);
  const groupedLiveIdlePerTile = liveTileTimers?.reduce<Record<TileType, number[]>>(
    (grouped, timer, i) => {
      const tile = tiles?.[i];
      if (!tile) return grouped;

      grouped[tile.kind] ??= [];
      grouped[tile.kind].push(timer);

      return grouped;
    },
    {} as Record<TileType, number[]>
  );

  const query = useSlotQuery(slot, true);

  const queryIdleData = useMemo(() => {
    if (!query.slotResponse?.tile_timers?.length || showLive || !tiles) return;

    return query.slotResponse.tile_timers.reduce<Record<string, number[][]>>(
      (aggTimerPerTileType, timers) => {
        if (!timers.tile_timers.length) return aggTimerPerTileType;
        const idleTimersPerTileType: Record<string, number[]> = {};

        if (timers.tile_timers.length !== tiles.length) {
          console.warn(
            "Length mismatch between tiles and time timers",
            timers.tile_timers,
            tiles
          );
        }

        for (let i = 0; i < timers.tile_timers.length; i++) {
          const timer   = timers.tile_timers[i];

          const tile = tiles[i];
          if (!tile) continue;

          idleTimersPerTileType[tile.kind] ??= [];
          idleTimersPerTileType[tile.kind].push(timer);
        }

        for (const [tile, idlePerTile] of Object.entries(idleTimersPerTileType)) {
          aggTimerPerTileType[tile] ??= [];
          aggTimerPerTileType[tile].push(idlePerTile);
        }

        return aggTimerPerTileType;
      },
      {}
    );
  }, [query.slotResponse?.tile_timers, showLive, tiles]);

  return (
    <div className={styles.container}>
      <TileCard
        header="net"
        subHeader="(in)"
        tileCount={tileCounts["net"]}
        liveIdlePerTile={groupedLiveIdlePerTile?.["net"]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.["net"]}
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
        header="net"
        subHeader="(out)"
        tileCount={tileCounts["net"]}
        liveIdlePerTile={groupedLiveIdlePerTile?.["net"]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.["net"]}
        statLabel="Egress" // mbs
        metricType="net_out"
      />
    </div>
  );
}
