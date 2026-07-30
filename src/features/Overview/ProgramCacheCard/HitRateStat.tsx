import { Flex, Text } from "@radix-ui/themes";
import cardStatStyles from "../../../components/cardStat.module.css";
import styles from "./hitRateStat.module.css";
import clsx from "clsx";
import { unknownChangedColor, unknownUnchangedColor } from "../../../colors";
import {
  hitRateChangedColor,
  hitRateUnchangedColor,
  getHitRateStatus,
  type HitRateStatus,
} from "../../../hitRate";
import { formatHitRate } from "../../../utils";
import ColorText from "../../../components/ColorText";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { liveProgramCacheAtom } from "../../../api/atoms";

type HitRateValues = {
  percentage: string;
  hits: string;
  misses: string;
  status: HitRateStatus;
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

    const fraction = lookups === 0 ? null : hits / lookups;
    const status = getHitRateStatus(fraction);

    return {
      percentage: fraction === null ? "-" : formatHitRate(fraction),
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
        <Text style={{ color: hitRateUnchangedColor(status) }}>{status}</Text>
      </Text>
      <Flex gap="2" align="center">
        <Flex align="baseline" gap="1" minWidth="70px">
          <ColorText
            value={percentage}
            changedColor={hitRateChangedColor(status)}
            unchangedColor={hitRateUnchangedColor(status)}
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
