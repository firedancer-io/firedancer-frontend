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
import { useTileSparkline } from "./useTileSparkline";

interface TileCardProps {
  header: string;
  subHeader?: string;
  tileCount: number;
  statLabel: string;
  liveIdlePerTile?: number[];
  queryIdlePerTile?: number[][];
  metricType?: keyof TilePrimaryMetric;
  includeBg?: boolean;
}

export default function TileCard({
  header,
  subHeader,
  tileCount,
  statLabel,
  liveIdlePerTile,
  queryIdlePerTile,
  metricType,
  includeBg = true,
}: TileCardProps) {
  const [ref, { width }] = useMeasure<HTMLDivElement>();

  const selectedSlot = useAtomValue(selectedSlotAtom);
  const isLive = selectedSlot === undefined;

  const { avgBusy, aggQueryBusyPerTs, tileCountArr, liveBusyPerTile, busy } =
    useTileSparkline({
      isLive,
      tileCount,
      liveIdlePerTile,
      queryIdlePerTile,
    });

  return (
    <Flex ref={ref}>
      <Card includeBg={includeBg}>
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
            includeBg={includeBg}
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
                        background: `gray`,
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
