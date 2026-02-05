import { Grid } from "@radix-ui/themes";
import type { TileType } from "../../../../api/types";
import TileCard from "../../../Overview/SlotPerformance/TileCard";
import { useTilesPerformance } from "../../../Overview/SlotPerformance/useTilesPerformance";
import styles from "./catchingUp.module.css";
import { useState } from "react";
import { useAtomValue } from "jotai";
import { isStartupProgressVisibleAtom } from "../../atoms";

const sparklineHeight = 30;
const tiles: TileType[] = ["shred", "repair", "replay", "execrp"];

export default function CatchingUpTiles() {
  const [_isExpanded, setIsExpanded] = useState(false);
  const isStartupVisible = useAtomValue(isStartupProgressVisibleAtom);
  const isExpanded = isStartupVisible && _isExpanded;

  const { tileCounts, groupedLiveIdlePerTile, showLive, queryIdleData } =
    useTilesPerformance();

  return (
    <Grid
      className={styles.tilesGrid}
      columns={{
        xs: "2",
        md: "4",
      }}
      gap="20px"
    >
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
    </Grid>
  );
}
