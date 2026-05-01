import { Flex, Text } from "@radix-ui/themes";
import cardStatStyles from "../../../components/cardStat.module.css";
import clsx from "clsx";
import Progress from "../../../components/Progress";
import { headerColor } from "../../../colors";
import { useMemo, type CSSProperties } from "react";
import { useAtomValue } from "jotai";
import { liveProgramCacheAtom } from "../../../api/atoms";
import { bytesUnits, formatBytes } from "../../../utils";
import { clamp } from "lodash";

type ValueWithUnit = {
  value: string;
  unit: string;
};

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
    const used = formatBytes(usedStorage, 2);
    const total = formatBytes(sizeBytes, 2);
    const progress = sizeBytes
      ? clamp((usedStorage / sizeBytes) * 100, 0, 100)
      : 0;

    // use the denominator's units if the numerator is only one unit smaller
    const numeratorUnitIdx = bytesUnits.findIndex(
      (unit) => unit.unit === used.unit,
    );
    const denominatorUnitIdx = bytesUnits.findIndex(
      (unit) => unit.unit === total.unit,
    );

    if (denominatorUnitIdx === numeratorUnitIdx + 1) {
      return {
        numerator: formatBytes(usedStorage, 3, total.unit),
        denominator: total,
        progress,
      };
    }

    return {
      numerator: used,
      denominator: total,
      progress,
    };
  }, [liveProgramCache]);

  return (
    <Flex direction="column">
      <Flex
        className={clsx(cardStatStyles.container)}
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
