import { Flex } from "@radix-ui/themes";
import type { TileType } from "../../../../api/types";
import TileCard from "../../../Overview/SlotPerformance/TileCard";
import { useTilesPerformance } from "../../../Overview/SlotPerformance/useTilesPerformance";
import styles from "./catchingUp.module.css";
import { useState } from "react";
import { useAtomValue } from "jotai";
import { isStartupProgressVisibleAtom } from "../../atoms";

const sparklineHeight = 30;
const tiles: TileType[] = ["shred", "repair", "replay", "exec"];

export default function CatchingUpTiles() {
  const [_isExpanded, setIsExpanded] = useState(false);
  const isStartupVisible = useAtomValue(isStartupProgressVisibleAtom);
  const isExpanded = isStartupVisible && _isExpanded;

  const { tileCounts, groupedLiveIdlePerTile, showLive, queryIdleData } =
    useTilesPerformance();

  return (
    <Flex gap="20px" justify="center" className={styles.tilesRow}>
      {tiles.map((tile) => (
        <TileCard
          key={tile}
          header={tile}
          tileCount={tileCounts[tile]}
          liveIdlePerTile={groupedLiveIdlePerTile?.[tile]}
          queryIdlePerTile={showLive ? undefined : queryIdleData?.[tile]}
          statLabel=""
          sparklineHeight={sparklineHeight}
          isExpanded={isExpanded}
          setIsExpanded={setIsExpanded}
        />
      ))}
    </Flex>
  );
}
