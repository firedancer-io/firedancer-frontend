import { Flex, Text } from "@radix-ui/themes";
import cardStatStyles from "../../../components/cardStat.module.css";
import styles from "./hitRateStat.module.css";
import clsx from "clsx";
import {
  goodChangedColor,
  goodUnchangedColor,
  badChangedColor,
  badUnchangedColor,
  unknownChangedColor,
  unknownUnchangedColor,
  averageChangedColor,
  averageUnchangedColor,
} from "../../../colors";
import ColorText from "../../../components/ColorText";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { liveProgramCacheAtom } from "../../../api/atoms";

type Status = "Unknown" | "Good" | "Average" | "Bad";

type HitRateValues = {
  percentage: string;
  numerator: string;
  denominator: string;
  showFraction: boolean;
  status: Status;
};

const colorsMap: Record<Status, { changed: string; unchanged: string }> = {
  Unknown: {
    changed: unknownChangedColor,
    unchanged: unknownUnchangedColor,
  },
  Good: {
    changed: goodChangedColor,
    unchanged: goodUnchangedColor,
  },
  Average: {
    changed: averageChangedColor,
    unchanged: averageUnchangedColor,
  },
  Bad: {
    changed: badChangedColor,
    unchanged: badUnchangedColor,
  },
};

export default function HitRateStat() {
  const liveProgramCache = useAtomValue(liveProgramCacheAtom);

  const {
    percentage,
    numerator,
    denominator,
    showFraction,
    status,
  }: HitRateValues = useMemo(() => {
    if (!liveProgramCache) {
      return {
        percentage: "-",
        numerator: "-",
        denominator: "-",
        showFraction: false,
        status: "Unknown",
      };
    }

    const { hits, lookups } = liveProgramCache;

    const percentage = lookups === 0 ? 0 : (hits / lookups) * 100;
    const status =
      lookups === 0
        ? "Unknown"
        : percentage < 99.95
          ? "Bad"
          : percentage < 99.999
            ? "Average"
            : "Good";

    return {
      percentage: percentage === 100 ? "100" : percentage.toFixed(20),
      numerator: hits.toLocaleString(),
      denominator: lookups.toLocaleString(),
      showFraction: Boolean(lookups),
      status,
    };
  }, [liveProgramCache]);

  return (
    <Flex
      className={clsx(cardStatStyles.container)}
      direction="column"
      align="start"
      gap="1"
    >
      <Text className={cardStatStyles.label}>
        <Text>Hit Rate</Text>{" "}
        <Text className={styles.trailing}>Trailing 1m</Text>{" "}
        <Text style={{ color: colorsMap[status].unchanged }}>{status}</Text>
      </Text>
      <Flex gap="2" align="center">
        <Flex align="baseline" gap="1">
          <ColorText
            value={percentage}
            changedColor={colorsMap[status].changed}
            unchangedColor={colorsMap[status].unchanged}
            className={clsx(cardStatStyles.value, cardStatStyles.small)}
          />
          <Text className={cardStatStyles.appendValue}>%</Text>
        </Flex>
        {showFraction && (
          <Flex direction="column" className={styles.fraction}>
            <ColorText
              value={numerator}
              changedColor={unknownChangedColor}
              unchangedColor={unknownUnchangedColor}
            />
            <hr className={styles.fractionLine} />
            <ColorText
              value={denominator}
              changedColor={unknownChangedColor}
              unchangedColor={unknownUnchangedColor}
            />
          </Flex>
        )}
      </Flex>
    </Flex>
  );
}
