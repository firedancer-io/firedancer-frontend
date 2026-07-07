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
import { formatHitRate } from "../../../utils";
import ColorText from "../../../components/ColorText";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { liveProgramCacheAtom } from "../../../api/atoms";

type Status = "Unknown" | "Good" | "Average" | "Bad";

type HitRateValues = {
  percentage: string;
  hits: string;
  misses: string;
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

  const { percentage, hits, misses, status }: HitRateValues = useMemo(() => {
    if (!liveProgramCache) {
      return {
        percentage: "-",
        hits: "-",
        misses: "-",
        status: "Unknown",
      };
    }

    const { hits, lookups } = liveProgramCache;

    const fraction = lookups === 0 ? 0 : hits / lookups;
    const status =
      lookups === 0
        ? "Unknown"
        : fraction < 0.9995
          ? "Bad"
          : fraction < 0.99999
            ? "Average"
            : "Good";

    return {
      percentage: formatHitRate(fraction),
      hits: hits.toLocaleString(),
      misses: (lookups - hits).toLocaleString(),
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
        <Flex align="baseline" gap="1" minWidth="70px">
          <ColorText
            value={percentage}
            changedColor={colorsMap[status].changed}
            unchangedColor={colorsMap[status].unchanged}
            className={clsx(cardStatStyles.value, cardStatStyles.small)}
          />
          <Text className={cardStatStyles.appendValue}>%</Text>
        </Flex>
        <Flex align="baseline" gap="1">
          <ColorText
            value={hits}
            changedColor={unknownChangedColor}
            unchangedColor={unknownUnchangedColor}
            className={clsx(cardStatStyles.value, cardStatStyles.small)}
          />
          <Text className={cardStatStyles.appendValue}>Hits</Text>
        </Flex>
        <Flex align="baseline" gap="1">
          <ColorText
            value={misses}
            changedColor={unknownChangedColor}
            unchangedColor={unknownUnchangedColor}
            className={clsx(cardStatStyles.value, cardStatStyles.small)}
          />
          <Text className={cardStatStyles.appendValue}>Misses</Text>
        </Flex>
      </Flex>
    </Flex>
  );
}
