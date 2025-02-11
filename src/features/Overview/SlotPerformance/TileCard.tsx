import { Box, Flex, Text } from "@radix-ui/themes";
import Card from "../../../components/Card";
import styles from "./tileCard.module.css";
import TileSparkLine from "./TileSparkLine";
import { mean } from "lodash";
import { TilePrimaryMetric } from "../../../api/types";
import { useAtomValue } from "jotai";
import TilePrimaryStat from "./TilePrimaryStat";
import TileBusy from "./TileBusy";
import { selectedSlotAtom } from "./atoms";
import TileSparkLineExpandedContainer from "./TileSparkLineExpandedContainer";
import { useMeasure } from "react-use";
import { isDefined } from "../../../utils";
import React, { useMemo } from "react";

interface TileCardProps {
  header: string;
  subHeader?: string;
  tileCount: number;
  statLabel: string;
  liveIdlePerTile?: number[];
  queryIdlePerTile?: number[][];
  metricType?: keyof TilePrimaryMetric;
}

export default function TileCard({
  header,
  subHeader,
  tileCount,
  statLabel,
  liveIdlePerTile,
  queryIdlePerTile,
  metricType,
}: TileCardProps) {
  const [ref, { width }] = useMeasure<HTMLDivElement>();
  const selectedSlot = useAtomValue(selectedSlotAtom);

  const tileCountArr = useMemo<unknown[]>(
    () => new Array(tileCount).fill(0),
    [tileCount]
  );

  const liveBusyPerTile = liveIdlePerTile
    ?.filter((idle) => idle !== -1)
    .map((idle) => 1 - idle);

  const aggQueryBusyPerTs = queryIdlePerTile
    ?.map((idlePerTile) => {
      const filtered = idlePerTile.filter((idle) => idle !== -1);
      if (!filtered.length) return;
      return 1 - mean(filtered);
    })
    .filter(isDefined);

  const aggQueryBusyPerTile = tileCountArr.map((_, i) => {
    const queryIdle = queryIdlePerTile
      ?.map((idlePerTile) => 1 - idlePerTile[i])
      .filter((b) => b !== undefined && b <= 1);

    if (!queryIdle?.length) return;

    return mean(queryIdle);
  });

  const busy = (!selectedSlot ? liveBusyPerTile : aggQueryBusyPerTile)?.filter(
    (b) => b !== undefined && b <= 1
  );
  const avgBusy = busy?.length ? mean(busy) : undefined;

  return (
    <Flex ref={ref}>
      <Card>
        <Flex direction="column" justify="between" height="100%" gap="1">
          <TileHeader
            header={header}
            subHeader={subHeader}
            statLabel={statLabel}
            metricType={metricType}
          />
          <Box flexGrow="1" />
          <TileSparkLine value={avgBusy} queryBusy={aggQueryBusyPerTs} />
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
