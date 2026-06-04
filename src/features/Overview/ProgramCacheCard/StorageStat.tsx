import { Flex, Text } from "@radix-ui/themes";
import cardStatStyles from "../../../components/cardStat.module.css";
import clsx from "clsx";
import Progress from "../../../components/Progress";
import { headerColor } from "../../../colors";
import { useMemo, type CSSProperties } from "react";
import { useAtomValue } from "jotai";
import { liveProgramCacheAtom } from "../../../api/atoms";
import { formatBytesFraction } from "../../../utils";
import type { ValueWithUnit } from "../../../utils";
import { clamp } from "lodash";
import styles from "./programCacheCard.module.css";

type StorageValues = {
  progress: number;
  numerator: ValueWithUnit;
  denominator: ValueWithUnit;
};

export default function StorageStat() {
  const liveProgramCache = useAtomValue(liveProgramCacheAtom);

  const { progress, numerator, denominator }: StorageValues = useMemo(() => {
    if (!liveProgramCache)
      return {
        progress: 0,
        numerator: { value: "-", unit: "B" },
        denominator: { value: "-", unit: "B" },
      };

    const { size_bytes: sizeBytes, free_bytes: freeBytes } = liveProgramCache;
    const usedStorage = sizeBytes - freeBytes;
    const progress = sizeBytes
      ? clamp((usedStorage / sizeBytes) * 100, 0, 100)
      : 0;

    const { numerator, denominator } = formatBytesFraction(
      usedStorage,
      sizeBytes,
      2,
    );

    return { numerator, denominator, progress };
  }, [liveProgramCache]);

  return (
    <Flex direction="column" className={styles.storageStatContainer}>
      <Flex
        className={cardStatStyles.container}
        direction="column"
        align="start"
      >
        <Text className={cardStatStyles.label}>Storage</Text>
        <Flex align="baseline" gap="1">
          <Text
            className={clsx(cardStatStyles.value, cardStatStyles.small)}
            style={{ color: headerColor } as CSSProperties}
          >
            {numerator.value}
          </Text>
          {numerator.unit !== denominator.unit && (
            <Text className={cardStatStyles.appendValue}>{numerator.unit}</Text>
          )}
          <Text className={clsx(cardStatStyles.value, cardStatStyles.small)}>
            /
          </Text>
          <Text className={clsx(cardStatStyles.value, cardStatStyles.small)}>
            {denominator.value}
          </Text>
          <Text className={cardStatStyles.appendValue}>{denominator.unit}</Text>
        </Flex>
      </Flex>
      <Progress value={progress} />
    </Flex>
  );
}
