import { Flex, Text } from "@radix-ui/themes";
import Card from "../../../components/Card";
import styles from "./tileCard.module.css";
import TileSparkLine from "./TileSparkLine";
import { mean } from "lodash";
import { TilePrimaryMetric } from "../../../api/types";
import { useAtomValue } from "jotai";
import TilePrimaryStat from "./TilePrimaryStat";
import TileBusy from "./TileBusy";
import { selectedSlotAtom } from "./atoms";

interface TileCardProps {
  header: string;
  subHeader?: string;
  tileCount: number;
  statLabel: string;
  liveTiles?: number[];
  queryIdle?: number[];
  metricType?: keyof TilePrimaryMetric;
}

export default function TileCard({
  header,
  subHeader,
  tileCount,
  statLabel,
  liveTiles,
  queryIdle,
  metricType,
}: TileCardProps) {
  const liveBusy = liveTiles?.map((idle) => 1 - idle) ?? [];
  const queryBusy = queryIdle?.map((idle) => 1 - idle);
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const busy = (!selectedSlot ? liveBusy : queryBusy)?.filter((b) => b <= 1);
  const avgBusy = busy?.length ? mean(busy) : undefined;

  return (
    <Card>
      <Flex direction="column" justify="between" height="100%" gap="1">
        <Flex justify="between" gap="1">
          <Flex direction="column" gap="0">
            <Text className={styles.header}>{header}</Text>
            {subHeader && <Text className={styles.subHeader}>{subHeader}</Text>}
          </Flex>
          {metricType && (
            <TilePrimaryStat type={metricType} label={statLabel} />
          )}
        </Flex>
        <TileSparkLine value={avgBusy} queryBusy={queryBusy} />
        <Flex gap="1">
          <div className={styles.tileContainer}>
            {new Array(tileCount).fill(0).map((_, i) => {
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
                  style={{
                    background: `color-mix(in oklab, #E13131 ${tileBusy * 100}%, #5f6fa9)`,
                  }}
                />
              );
            })}
          </div>
          <TileBusy busy={avgBusy} />
        </Flex>
      </Flex>
    </Card>
  );
}
