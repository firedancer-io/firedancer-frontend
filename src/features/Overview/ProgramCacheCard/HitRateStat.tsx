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
import { useMemo, type CSSProperties } from "react";
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
    <div
      className={clsx(
        "rt-Flex rt-r-fd-column rt-r-ai-start rt-r-gap-1",
        cardStatStyles.container,
      )}
    >
      <span className={clsx("rt-Text", cardStatStyles.label)}>
        <span className="rt-Text">Hit Rate</span>{" "}
        <span className={clsx("rt-Text", styles.trailing)}>Trailing 1m</span>{" "}
        <span
          className="rt-Text"
          style={{ color: hitRateUnchangedColor(status) }}
        >
          {status}
        </span>
      </span>
      <div className="rt-Flex rt-r-ai-center rt-r-gap-2">
        <div
          className="rt-Flex rt-r-ai-baseline rt-r-gap-1 rt-r-min-w"
          style={{ "--min-width": "70px" } as CSSProperties}
        >
          <ColorText
            value={percentage}
            changedColor={hitRateChangedColor(status)}
            unchangedColor={hitRateUnchangedColor(status)}
            className={clsx(cardStatStyles.value, cardStatStyles.small)}
          />
          <span className={clsx("rt-Text", cardStatStyles.appendValue)}>%</span>
        </div>
        <div className="rt-Flex rt-r-ai-baseline rt-r-gap-1">
          <ColorText
            value={hits}
            changedColor={unknownChangedColor}
            unchangedColor={unknownUnchangedColor}
            className={clsx(cardStatStyles.value, cardStatStyles.small)}
          />
          <span className={clsx("rt-Text", cardStatStyles.appendValue)}>
            Hits
          </span>
        </div>
        <div className="rt-Flex rt-r-ai-baseline rt-r-gap-1">
          <ColorText
            value={misses}
            changedColor={unknownChangedColor}
            unchangedColor={unknownUnchangedColor}
            className={clsx(cardStatStyles.value, cardStatStyles.small)}
          />
          <span className={clsx("rt-Text", cardStatStyles.appendValue)}>
            Misses
          </span>
        </div>
      </div>
    </div>
  );
}
