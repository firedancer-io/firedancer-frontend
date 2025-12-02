import { Box, Flex, Text } from "@radix-ui/themes";
import Card from "../../../components/Card";
import styles from "./tileCard.module.css";
import TileSparkLine from "./TileSparkLine";
import type { TilePrimaryMetric } from "../../../api/types";
import { useAtomValue } from "jotai";
import TilePrimaryStat from "./TilePrimaryStat";
import TileBusy from "./TileBusy";
import { selectedSlotAtom } from "./atoms";
import TileSparkLineExpandedContainer from "./TileSparkLineExpandedContainer";
import { useMeasure } from "react-use";
import type React from "react";
import { useLastDefinedValue, useTileSparkline } from "./useTileSparkline";
import clsx from "clsx";

interface TileCardProps {
  header: string;
  subHeader?: string;
  tileCount: number;
  statLabel: string;
  liveIdlePerTile?: number[];
  queryIdlePerTile?: number[][];
  metricType?: keyof TilePrimaryMetric;
  sparklineHeight?: number;
  isExpanded?: boolean;
  setIsExpanded?: (isExpanded: boolean) => void;
  isDark?: boolean;
  isNarrow?: boolean;
}

export default function TileCard({
  header,
  subHeader,
  tileCount,
  statLabel,
  liveIdlePerTile,
  queryIdlePerTile,
  metricType,
  sparklineHeight,
  isExpanded = false,
  setIsExpanded = () => {},
  isDark = false,
  isNarrow,
}: TileCardProps) {
  const [ref, { width }] = useMeasure<HTMLDivElement>();

  const selectedSlot = useAtomValue(selectedSlotAtom);
  const isLive = selectedSlot === undefined;

  const {
    avgBusy: currentAvgBusy,
    aggQueryBusyPerTs,
    tileCountArr,
    liveBusyPerTile,
    busy,
  } = useTileSparkline({
    isLive,
    tileCount,
    liveIdlePerTile,
    queryIdlePerTile,
  });
  const avgBusy = useLastDefinedValue(currentAvgBusy);

  return (
    <Flex ref={ref}>
      <Card
        className={clsx(styles.fullWidth, isDark && styles.dark)}
        isNarrow={isNarrow}
      >
        <Flex direction="column" justify="between" height="100%" gap="1">
          <TileHeader
            header={header}
            subHeader={subHeader}
            statLabel={statLabel}
            metricType={metricType}
          />
          <Box flexGrow="1" />
          <TileSparkLine
            value={avgBusy}
            queryBusy={aggQueryBusyPerTs}
            height={sparklineHeight}
            background={isDark ? "#0000001F" : undefined}
          />
          <TileSparkLineExpandedContainer
            tileCountArr={tileCountArr}
            liveBusyPerTile={liveBusyPerTile}
            queryIdlePerTile={queryIdlePerTile}
            width={width}
            header={
              <TileHeader
                header={header}
                subHeader={subHeader}
                statLabel={statLabel}
                metricType={metricType}
              />
            }
            isExpanded={isExpanded}
            setIsExpanded={setIsExpanded}
          >
            <div className={styles.tileContainer}>
              {tileCountArr.map((_, i) => {
                const tileBusy = busy?.[i];
                if (tileBusy === undefined) {
                  return (
                    <div
                      key={i}
                      className={styles.tile}
                      style={{
                        background: isDark ? "#232A38" : "gray",
                      }}
                    />
                  );
                }

                return (
                  <div
                    key={i}
                    className={styles.tile}
                    style={
                      {
                        "--busy": `${tileBusy * 100}%`,
                      } as React.CSSProperties
                    }
                  />
                );
              })}
            </div>
            <TileBusy busy={avgBusy} />
          </TileSparkLineExpandedContainer>
        </Flex>
      </Card>
    </Flex>
  );
}

function TileHeader({
  header,
  subHeader,
  metricType,
  statLabel,
}: Pick<TileCardProps, "header" | "subHeader" | "metricType" | "statLabel">) {
  return (
    <Flex justify="between" gap="1">
      <Flex direction="column" gap="0">
        <Text className={styles.header}>{header}</Text>
        {subHeader && <Text className={styles.subHeader}>{subHeader}</Text>}
      </Flex>
      {metricType && <TilePrimaryStat type={metricType} label={statLabel} />}
    </Flex>
  );
}
