import { Card, Flex, Text } from "@radix-ui/themes";
import clsx from "clsx";
import { useAtomValue } from "jotai";
import { useState, type CSSProperties } from "react";
import type { TileType } from "../../../../api/types";
import {
  tileCountAtom,
  liveSnapshotTimersAtom,
} from "../../../Overview/SlotPerformance/atoms";
import TileBusy from "../../../Overview/SlotPerformance/TileBusy";
import { Sparkline } from "../../../Overview/SlotPerformance/TileSparkLine";
import TileSparkLineExpandedContainer from "../../../Overview/SlotPerformance/TileSparkLineExpandedContainer";
import {
  useTileSparkline,
  useScaledDataPoints,
  useLastDefinedValue,
} from "../../../Overview/SlotPerformance/useTileSparkline";
import styles from "./snapshot.module.css";

const gridSize = 15;
// add 1 px for the final grid line
const height = gridSize * 6 + 1;
const width = gridSize * 15 + 1;

const windowMs = 6000;
const updateIntervalMs = 50;

interface SnapshotSparklineCardProps {
  title: string;
  tileType: TileType;
  isComplete?: boolean;
}
export default function SnapshotSparklineCard({
  title,
  tileType,
  isComplete,
}: SnapshotSparklineCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const tileCounts = useAtomValue(tileCountAtom);
  const timers = useAtomValue(liveSnapshotTimersAtom);

  const {
    avgBusy: currentAvgBusy,
    tileCountArr,
    liveBusyPerTile,
    busy,
  } = useTileSparkline({
    isLive: true,
    tileCount: tileCounts[tileType],
    liveIdlePerTile: timers?.[tileType],
  });
  const lastDefinedAvgBusy = useLastDefinedValue(currentAvgBusy);
  const avgBusy = isComplete ? currentAvgBusy : lastDefinedAvgBusy;

  const { scaledDataPoints, range, pxPerTick, chartTickMs, isLive } =
    useScaledDataPoints({
      value: avgBusy,
      windowMs,
      height,
      width,
      updateIntervalMs,
      stopShifting: isComplete,
    });

  const header = (
    <Flex justify="between" align="center">
      <Text className={styles.snapshotTileTitle}>{title}</Text>
      <TileBusy busy={avgBusy} className={styles.snapshotTileBusy} />
    </Flex>
  );

  return (
    <Card className={clsx(styles.card, styles.sparklineCard)}>
      {header}

      <Flex justify="center">
        <Flex
          className={styles.sparklineContainer}
          style={{
            width: `${width}px`,
            backgroundSize: `${gridSize}px ${gridSize}px`,
          }}
        >
          <Sparkline
            scaledDataPoints={scaledDataPoints}
            range={range}
            showRange
            height={height}
            background="transparent"
            tickMs={chartTickMs}
            pxPerTick={pxPerTick}
            isLive={isLive}
          />
        </Flex>
      </Flex>

      <TileSparkLineExpandedContainer
        tileCountArr={tileCountArr}
        liveBusyPerTile={liveBusyPerTile}
        width={width}
        label={`Expand ${title} per tile`}
        header={header}
        isExpanded={isExpanded}
        setIsExpanded={setIsExpanded}
      >
        <div className={styles.tileContainer}>
          {tileCountArr.map((_, i) => {
            const tileBusy = busy?.[i];
            if (tileBusy === undefined) {
              return (
                <div key={i} className={clsx(styles.tile, styles.tileEmpty)} />
              );
            }

            return (
              <div
                key={i}
                className={styles.tile}
                style={{ "--busy": `${tileBusy * 100}%` } as CSSProperties}
              />
            );
          })}
        </div>
      </TileSparkLineExpandedContainer>
    </Card>
  );
}
