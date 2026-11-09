import { type ReactNode } from "react";
import { Box, Flex } from "@radix-ui/themes";
import clsx from "clsx";
import { TimelineEventType } from "../../../../api/entities.ts";
import styles from "./eventsTrack.module.css";
import chartStyles from "../../chart.module.css";
import FlagIcon from "../../../../assets/flag.svg?react";

interface PinFrameProps {
  count?: number;
  className: string;
  children: ReactNode;
  fullHeightBar?: boolean;
}

function PinFrame({
  count,
  className,
  children,
  fullHeightBar,
}: PinFrameProps) {
  return (
    <Flex
      width="100%"
      height="100%"
      direction="column"
      align="center"
      justify="between"
      className={clsx(chartStyles.noChartExplore, className)}
    >
      <Flex
        position="relative"
        className={clsx(fullHeightBar && styles.pinStretch)}
      >
        {children}
        {count && <span className={styles.pinCount}>{count}</span>}
      </Flex>
    </Flex>
  );
}

interface BasePinProps {
  noBar?: boolean;
  fullHeightBar?: boolean;
}

function BasePin({ noBar, fullHeightBar }: BasePinProps) {
  return (
    <Flex
      direction="column"
      align="center"
      className={clsx(fullHeightBar && styles.pinStretch)}
    >
      <svg
        className={styles.pinTriangle}
        xmlns="http://www.w3.org/2000/svg"
        width="10"
        height="7"
        viewBox="0 0 10 7"
        fill="none"
      >
        <path d="M1 0.5H9L5 5.5L1 0.5Z" stroke="black" />
      </svg>
      {!noBar && (
        <Box
          className={clsx(styles.pinBar, fullHeightBar && styles.pinBarFull)}
        />
      )}
    </Flex>
  );
}

interface PinConfig {
  className: string;
  noBar?: boolean;
  icon?: "flag";
}

const pinConfigByType: Record<TimelineEventType, PinConfig> = {
  [TimelineEventType.LeaderSkip]: { className: styles.pinSkipped },
  [TimelineEventType.IdentitySet]: { className: styles.pinIdentitySet },
  [TimelineEventType.IdentityPromote]: { className: styles.pinIdentityPromote },
  [TimelineEventType.IdentityTakeover]: {
    className: styles.pinIdentityTakeover,
  },
  [TimelineEventType.IdentityHandoff]: { className: styles.pinIdentityHandoff },
  [TimelineEventType.EpochStart]: { className: styles.pinEpochStart },
  // triangle with no stem under it
  [TimelineEventType.Boot]: { className: styles.pinBoot, noBar: true },
  // flag icon instead of the triangle; keeps its own color
  [TimelineEventType.CatchUp]: { className: styles.pinCatchUp, icon: "flag" },
};

interface PinProps {
  eventType: TimelineEventType;
  count?: number;
  fullHeightBar?: boolean;
}

export function Pin({ eventType, count, fullHeightBar }: PinProps) {
  const { className, noBar, icon } = pinConfigByType[eventType];

  return (
    <PinFrame className={className} count={count} fullHeightBar={fullHeightBar}>
      {icon === "flag" ? (
        <FlagIcon className={styles.pinFlag} />
      ) : (
        <BasePin noBar={noBar} fullHeightBar={fullHeightBar} />
      )}
    </PinFrame>
  );
}
