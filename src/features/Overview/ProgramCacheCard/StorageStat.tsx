import { clamp } from "../../../mathUtils";
import cardStatStyles from "../../../components/cardStat.module.css";
import clsx from "clsx";
import Progress from "../../../components/Progress";
import { headerColor } from "../../../colors";
import { useMemo, type CSSProperties } from "react";
import { useAtomValue } from "jotai";
import { liveProgramCacheAtom } from "../../../api/atoms";
import { formatSIBytesFraction } from "../../../utils";
import type { ValueWithUnit } from "../../../utils";
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

    const { numerator, denominator } = formatSIBytesFraction(
      usedStorage,
      sizeBytes,
      2,
    );

    return { numerator, denominator, progress };
  }, [liveProgramCache]);

  return (
    <div
      className={clsx("rt-Flex rt-r-fd-column", styles.storageStatContainer)}
    >
      <div
        className={clsx(
          "rt-Flex rt-r-fd-column rt-r-ai-start",
          cardStatStyles.container,
        )}
      >
        <span className={clsx("rt-Text", cardStatStyles.label)}>Storage</span>
        <div className="rt-Flex rt-r-ai-baseline rt-r-gap-1">
          <span
            className={clsx(
              "rt-Text",
              cardStatStyles.value,
              cardStatStyles.small,
            )}
            style={{ color: headerColor } as CSSProperties}
          >
            {numerator.value}
          </span>
          {numerator.unit !== denominator.unit && (
            <span className={clsx("rt-Text", cardStatStyles.appendValue)}>
              {numerator.unit}
            </span>
          )}
          <span
            className={clsx(
              "rt-Text",
              cardStatStyles.value,
              cardStatStyles.small,
            )}
          >
            /
          </span>
          <span
            className={clsx(
              "rt-Text",
              cardStatStyles.value,
              cardStatStyles.small,
            )}
          >
            {denominator.value}
          </span>
          <span className={clsx("rt-Text", cardStatStyles.appendValue)}>
            {denominator.unit}
          </span>
        </div>
      </div>
      <Progress value={progress} />
    </div>
  );
}
