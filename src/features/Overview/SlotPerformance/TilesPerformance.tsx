import styles from "./tilesPerformance.module.css";
import TileCard from "./TileCard";
import { atom, useAtomValue } from "jotai";
import { tilesAtom, tileTimerAtom } from "../../../api/atoms";
import { countBy, mean } from "lodash";
import { selectedSlotAtom } from "./atoms";
import { useMemo } from "react";
import useSlotQuery from "../../../hooks/useSlotQuery";
import { TileType } from "../../../api/types";

const liveTileTimerfallAtom = atom((get) => {
  const selectedSlot = get(selectedSlotAtom);
  if (selectedSlot) return;

  return get(tileTimerAtom);
});

export default function TilesPerformance() {
  const liveTileTimer = useAtomValue(liveTileTimerfallAtom);
  const slot = useAtomValue(selectedSlotAtom);
  const showLive = !slot;

  const tiles = useAtomValue(tilesAtom);
  const tileCounts = countBy(tiles, (t) => t.kind);
  const timers = liveTileTimer?.reduce<Record<TileType, number[]>>(
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

    return query.slotResponse.tile_timers.reduce<Record<string, number[]>>(
      (aggTimers, timers) => {
        if (!timers.tile_timers.length) return aggTimers;
        const groupedIdle: Record<string, number[]> = {};

        for (let i = 0; i < timers.tile_timers.length; i++) {
          const timer = timers.tile_timers[i];
          if (timer === -1) continue;

          groupedIdle[tiles[i].kind] ??= [];
          groupedIdle[tiles[i].kind].push(timer);
        }

        for (const [tile, idleArr] of Object.entries(groupedIdle)) {
          aggTimers[tile] ??= [];
          aggTimers[tile].push(mean(idleArr));
        }

        return aggTimers;
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
        liveTiles={timers?.["net"]}
        queryIdle={showLive ? undefined : queryIdleData?.["net"]}
        statLabel="Ingress" // bandidth, mb
        metricType="net_in"
      />
      <TileCard
        header="QUIC"
        tileCount={tileCounts["quic"]}
        liveTiles={timers?.["quic"]}
        queryIdle={showLive ? undefined : queryIdleData?.["quic"]}
        statLabel="Conns"
        metricType="quic"
      />
      <TileCard
        header="verify"
        tileCount={tileCounts["verify"]}
        liveTiles={timers?.["verify"]}
        queryIdle={showLive ? undefined : queryIdleData?.["verify"]}
        statLabel="Failed"
        metricType="verify"
      />
      <TileCard
        header="dedup"
        tileCount={tileCounts["dedup"]}
        liveTiles={timers?.["dedup"]}
        queryIdle={showLive ? undefined : queryIdleData?.["dedup"]}
        statLabel="Dupes"
        metricType="dedup"
      />
      <TileCard
        header="pack"
        tileCount={tileCounts["pack"]}
        liveTiles={timers?.["pack"]}
        queryIdle={showLive ? undefined : queryIdleData?.["pack"]}
        statLabel="Full"
        metricType="pack"
      />
      <TileCard
        header="bank"
        tileCount={tileCounts["bank"]}
        liveTiles={timers?.["bank"]}
        queryIdle={showLive ? undefined : queryIdleData?.["bank"]}
        statLabel="TPS"
        metricType="bank"
      />
      <TileCard
        header="poh"
        tileCount={tileCounts["poh"]}
        liveTiles={timers?.["poh"]}
        queryIdle={showLive ? undefined : queryIdleData?.["poh"]}
        statLabel="Hash"
        // metricType="poh"
      />
      <TileCard
        header="shred"
        tileCount={tileCounts["shred"]}
        liveTiles={timers?.["shred"]}
        queryIdle={showLive ? undefined : queryIdleData?.["shred"]}
        statLabel="Shreds"
        // metricType="shred"
      />
      <TileCard
        header="store"
        tileCount={tileCounts["store"]}
        liveTiles={timers?.["store"]}
        queryIdle={showLive ? undefined : queryIdleData?.["store"]}
        statLabel="Latency"
        // metricType="store"
      />
      <TileCard
        header="net"
        subHeader="(out)"
        tileCount={tileCounts["net"]}
        liveTiles={timers?.["net"]}
        queryIdle={showLive ? undefined : queryIdleData?.["net"]}
        statLabel="Egress" // mbs
        metricType="net_out"
      />
    </div>
  );
}
