import { Card, Flex, Text } from "@radix-ui/themes";
import { Sparkline } from "../../Overview/SlotPerformance/TileSparkLine";
import styles from "./snapshot.module.css";
import clsx from "clsx";
import { useAtomValue } from "jotai";
import {
  liveSnapshotTimersAtom,
  tileCountAtom,
} from "../../Overview/SlotPerformance/atoms";
import {
  useScaledDataPoints,
  useTileSparkline,
} from "../../Overview/SlotPerformance/useTileSparkline";
import type { TileType } from "../../../api/types";
import TileBusy from "../../Overview/SlotPerformance/TileBusy";
import { useMeasure } from "react-use";

const gridSize = 20;
// add 1 px for the final grid line
const height = gridSize * 5 + 1;
const width = gridSize * 15 + 1;

const rollingWindowMs = 6000;
const updateIntervalMs = 10;

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
  const tileCounts = useAtomValue(tileCountAtom);
  const timers = useAtomValue(liveSnapshotTimersAtom);
  const [svgRef] = useMeasure<SVGSVGElement>();

  const { avgBusy } = useTileSparkline({
    isLive: true,
    tileCount: tileCounts[tileType],
    liveIdlePerTile: timers?.[tileType],
  });

  const { scaledDataPoints, range } = useScaledDataPoints({
    value: avgBusy,
    rollingWindowMs,
    height,
    width,
    updateIntervalMs,
    stopShifting: isComplete,
  });

  return (
    <Card className={clsx(styles.card, styles.sparklineCard)}>
      <Flex justify="between" align="center">
        <Text className={styles.snapshotTileTitle}>{title}</Text>
        <TileBusy busy={avgBusy} className={styles.snapshotTileBusy} />
      </Flex>

      <Flex
        className={styles.sparklineContainer}
        style={{
          width: `${width}px`,
          backgroundSize: `${gridSize}px ${gridSize}px`,
        }}
      >
        <Sparkline
          svgRef={svgRef}
          scaledDataPoints={scaledDataPoints}
          range={range}
          showRange
          height={height}
          background="transparent"
        />
      </Flex>
    </Card>
  );
}
