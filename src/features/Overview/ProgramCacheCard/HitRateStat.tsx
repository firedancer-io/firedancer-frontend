import { Flex, Text } from "@radix-ui/themes";
import cardStatStyles from "../../../components/cardStat.module.css";
import styles from "./hitRateStat.module.css";
import clsx from "clsx";
import {
  healthyChangedColor,
  healthyUnchangedColor,
  unhealthyChangedColor,
  unhealthyUnchangedColor,
  unknownChangedColor,
  unknownUnchangedColor,
  worseningChangedColor,
  worseningUnchangedColor,
} from "../../../colors";
import ColorText from "../../../components/ColorText";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { liveProgramCacheAtom } from "../../../api/atoms";

type Status = "Unknown" | "Healthy" | "Worsening" | "Unhealthy";

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
  Healthy: {
    changed: healthyChangedColor,
    unchanged: healthyUnchangedColor,
  },
  Worsening: {
    changed: worseningChangedColor,
    unchanged: worseningUnchangedColor,
  },
  Unhealthy: {
    changed: unhealthyChangedColor,
    unchanged: unhealthyUnchangedColor,
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
          ? "Unhealthy"
          : percentage < 99.999
            ? "Worsening"
            : "Healthy";

    return {
      percentage: String(percentage),
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
    >
      <Text className={cardStatStyles.label}>
        <Text>Hit Rate</Text>{" "}
        <Text style={{ color: colorsMap[status].unchanged }}>{status}</Text>
      </Text>
      <Flex gap="2">
        <Flex align="baseline" gap="1" className={clsx(styles.values)}>
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
