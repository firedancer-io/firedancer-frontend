import { useState } from "react";
import type { TileType } from "../../../api/types";
import TileCard from "../SlotPerformance/TileCard";
import styles from "../SlotPerformance/tilesPerformance.module.css";
import { useTilesPerformance } from "../SlotPerformance/useTilesPerformance";

const tiles: TileType[] = [
  "netlnk",
  "metric",
  "ipecho",
  "gossvf",
  "gossip",
  "repair",
  "replay",
  "exec",
  "tower",
  "send",
  "sign",
  "rpc",
  "gui",
];
export default function ShredTiles() {
  const [isExpanded, setIsExpanded] = useState(false);
  const { tileCounts, groupedLiveIdlePerTile, showLive, queryIdleData } =
    useTilesPerformance();

  return (
    <div className={styles.container}>
      {tiles.map((tile) => (
        <TileCard
          key={tile}
          header={tile}
          tileCount={tileCounts[tile]}
          liveIdlePerTile={groupedLiveIdlePerTile?.[tile]}
          queryIdlePerTile={showLive ? undefined : queryIdleData?.[tile]}
          statLabel=""
          isExpanded={isExpanded}
          setIsExpanded={setIsExpanded}
        />
      ))}
    </div>
  );
}
