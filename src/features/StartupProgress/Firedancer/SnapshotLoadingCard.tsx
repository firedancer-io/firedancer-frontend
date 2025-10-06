import { Card, Flex, Text } from "@radix-ui/themes";
import styles from "./snapshot.module.css";
import type { ByteSizeResult } from "byte-size";
import byteSize from "byte-size";
import clsx from "clsx";
import { Bars } from "./Bars";
import { useValuePerSecond } from "./useValuePerSecond";

const MAX_THROUGHPUT_BYTES_PER_S = 300_000_000;

interface SnapshotLoadingCardProps {
  title: string;
  completed?: number | null;
  total?: number | null;
}
export function SnapshotLoadingCard({
  title,
  completed,
  total,
}: SnapshotLoadingCardProps) {
  const throughput = useValuePerSecond(completed);

  const throughputObj = throughput == null ? undefined : byteSize(throughput);
  const completedObj = completed == null ? undefined : byteSize(completed);
  const totalObj = total == null ? undefined : byteSize(total);

  return (
    <Card className={clsx(styles.card, styles.loadingCard)}>
      <Flex direction="column" gap="20px" justify="between" height="100%">
        <Flex
          justify="between"
          align="center"
          className={styles.snapshotLoadingRow}
        >
          <Text className={styles.cardHeader}>{title}</Text>

          <div className={styles.centerAlign}>
            <ValueUnitText byteSizeResult={completedObj} />

            <Text> / </Text>

            <ValueUnitText byteSizeResult={totalObj} />
          </div>

          {throughputObj ? (
            <span className={styles.rightAlign}>
              <Text className={styles.snapshotPctText}>
                {throughputObj.value}
              </Text>{" "}
              <Text className={styles.secondaryColor}>
                {throughputObj.unit}/sec
              </Text>
            </span>
          ) : (
            <Text className={clsx(styles.secondaryColor, styles.rightAlign)}>
              --
            </Text>
          )}
        </Flex>

        <Bars value={throughput ?? 0} max={MAX_THROUGHPUT_BYTES_PER_S} />
      </Flex>
    </Card>
  );
}

function ValueUnitText({
  byteSizeResult,
  unitSuffix,
}: {
  byteSizeResult?: ByteSizeResult;
  unitSuffix?: string;
}) {
  return byteSizeResult ? (
    <>
      <Text>{byteSizeResult.value}</Text>{" "}
      <Text className={styles.secondaryColor}>
        {byteSizeResult.unit}
        {unitSuffix}
      </Text>
    </>
  ) : (
    "--"
  );
}
