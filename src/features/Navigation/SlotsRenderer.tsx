import { atom, useAtomValue } from "jotai";
import {
  currentLeaderSlotAtom,
  currentSlotAtom,
  firstProcessedSlotAtom,
  leaderSlotsAtom,
  nextLeaderSlotAtom,
  slotDurationAtom,
} from "../../atoms";
import { Box, Flex, Progress, Text } from "@radix-ui/themes";
import { useSlotQueryPublish } from "../../hooks/useSlotQuery";
import type React from "react";
import { memo, useMemo } from "react";
import type { CSSProperties } from "react";
import styles from "./slotsRenderer.module.css";
import PeerIcon from "../../components/PeerIcon";
import { slotsPerLeader } from "../../consts";
import { useSlotInfo } from "../../hooks/useSlotInfo";
import clsx from "clsx";
import { Link } from "@tanstack/react-router";
import { getSlotGroupLeader } from "../../utils";
import { selectedSlotAtom } from "../Overview/SlotPerformance/atoms";
import {
  slotStatusBlue,
  slotStatusDullTeal,
  slotStatusGreen,
  slotStatusRed,
  slotStatusTeal,
} from "../../colors";
import SlotClient from "../../components/SlotClient";
import { useIsLeaderGroupSkipped } from "../../hooks/useIsLeaderGroupSkipped";
import { isScrollingAtom } from "./atoms";
import useNextSlot from "../../hooks/useNextSlot";
import type { SlotPublish } from "../../api/types";

export default function SlotsRenderer(props: { leaderSlotForGroup: number }) {
  const isScrolling = useAtomValue(isScrollingAtom);

  if (isScrolling) return <div className={styles.placeholder} />;

  return <MSlotsRenderer {...props}></MSlotsRenderer>;
}

const getStatusAtom = atom((get) => {
  const currentLeaderSlot = get(currentLeaderSlotAtom);
  const firstProcessedSlot = get(firstProcessedSlotAtom);
  const leaderSlots = get(leaderSlotsAtom);

  if (
    !leaderSlots ||
    currentLeaderSlot === undefined ||
    firstProcessedSlot === undefined
  )
    return;

  const nextLeaderSlot = get(nextLeaderSlotAtom);

  return function getStatus(slot: number) {
    return {
      isCurrentSlotGroup:
        currentLeaderSlot <= slot && slot < currentLeaderSlot + slotsPerLeader,
      isFutureSlotGroup: currentLeaderSlot + slotsPerLeader <= slot,
      isProcessedSlotGroup:
        firstProcessedSlot <= slot && slot <= currentLeaderSlot,
      isYourNextLeaderGroup:
        nextLeaderSlot &&
        nextLeaderSlot <= slot &&
        slot < nextLeaderSlot + slotsPerLeader,
    };
  };
});

const MSlotsRenderer = memo(function SlotsRenderer({
  leaderSlotForGroup,
}: {
  leaderSlotForGroup: number;
}) {
  const getStatus = useAtomValue(getStatusAtom);
  const status = getStatus?.(leaderSlotForGroup);
  if (!status) return <div className={styles.placeholder} />;

  const { isFutureSlotGroup, isCurrentSlotGroup, isYourNextLeaderGroup } =
    status;

  return (
    <div className={styles.slotGroupContainer}>
      {isCurrentSlotGroup ? (
        <CurrentLeaderSlotGroup firstSlot={leaderSlotForGroup} />
      ) : isYourNextLeaderGroup ? (
        <YourNextLeaderSlotGroup firstSlot={leaderSlotForGroup} />
      ) : isFutureSlotGroup ? (
        <FutureSlotGroup firstSlot={leaderSlotForGroup} />
      ) : (
        <PastSlotGroup firstSlot={leaderSlotForGroup} />
      )}
    </div>
  );
});

function YourNextLeaderSlotGroup({ firstSlot }: { firstSlot: number }) {
  const { progressSinceLastLeader, nextSlotText } = useNextSlot({
    showNowIfCurrent: false,
    durationOptions: {
      showOnlyTwoSignificantUnits: true,
    },
  });

  return (
    <Flex
      direction="column"
      className={clsx(styles.slotGroup, styles.future, styles.you)}
    >
      <Flex justify="between">
        <SlotIconName slot={firstSlot} />

        <Flex gap="3px">
          <Text className={styles.slotName}>{nextSlotText}</Text>
          <SlotStatuses firstSlot={firstSlot} />
        </Flex>
      </Flex>

      <Progress
        value={progressSinceLastLeader}
        size="1"
        className={styles.progressBar}
      />
    </Flex>
  );
}

interface SlotGroupProps {
  firstSlot: number;
}

function FutureSlotGroup({ firstSlot }: SlotGroupProps) {
  const { isLeader: isYou } = useSlotInfo(firstSlot);
  return (
    <Flex
      justify="between"
      className={clsx(styles.slotGroup, styles.future, { [styles.you]: isYou })}
    >
      <SlotIconName slot={firstSlot} />
      <SlotStatuses firstSlot={firstSlot} />
    </Flex>
  );
}

function CurrentLeaderSlotGroup({ firstSlot }: { firstSlot: number }) {
  const { isLeader: isYou, countryFlag } = useSlotInfo(firstSlot);
  const hasSkipped = useIsLeaderGroupSkipped(firstSlot);
  const currentSlot = useAtomValue(currentSlotAtom);
  return (
    <Flex
      justify="between"
      className={clsx(styles.slotGroup, styles.current, {
        [styles.you]: isYou,
        [styles.skipped]: hasSkipped,
      })}
    >
      <Flex direction="column" className={styles.leftColumn}>
        <SlotIconName slot={firstSlot} iconSize={22} />
        <Flex gap="1" align="center" className={styles.currentSlotRow}>
          <SlotClient slot={firstSlot} size="small" />
          <Text size="2">{currentSlot}</Text>
          {countryFlag && <Text>{countryFlag}</Text>}
        </Flex>
      </Flex>

      <SlotStatuses firstSlot={firstSlot} isCurrentSlot />
    </Flex>
  );
}

function PastSlotGroup({ firstSlot }: SlotGroupProps) {
  const { isLeader: isYou } = useSlotInfo(firstSlot);
  const getStatus = useAtomValue(getStatusAtom);
  const status = getStatus?.(firstSlot);
  const hasSkipped = useIsLeaderGroupSkipped(firstSlot);

  if (!status) return;
  const { isProcessedSlotGroup } = status;

  return isYou && isProcessedSlotGroup ? (
    <YourProcessedSlotGroup firstSlot={firstSlot} />
  ) : (
    <Flex
      className={clsx(styles.slotGroup, styles.past, {
        [styles.you]: isYou,
        [styles.skipped]: hasSkipped,
      })}
    >
      <SlotContent firstSlot={firstSlot} />
      <SlotStatuses firstSlot={firstSlot} isPastSlot />
    </Flex>
  );
}

function YourProcessedSlotGroup({ firstSlot }: { firstSlot: number }) {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const hasSkipped = useIsLeaderGroupSkipped(firstSlot);

  const isSelected =
    selectedSlot !== undefined &&
    getSlotGroupLeader(selectedSlot) === firstSlot;

  return (
    <Flex
      className={clsx(
        styles.slotGroup,
        styles.past,
        styles.you,
        styles.processed,
        {
          [styles.selected]: isSelected,
          [styles.skipped]: hasSkipped,
        },
      )}
      asChild
    >
      <Link to="/slotDetails" search={{ slot: firstSlot }}>
        <SlotContent firstSlot={firstSlot} />
        <SlotStatuses firstSlot={firstSlot} isPastSlot />
      </Link>
    </Flex>
  );
}

function SlotContent({ firstSlot }: SlotGroupProps) {
  const { countryFlag } = useSlotInfo(firstSlot);
  return (
    <Flex className={styles.leftColumn} direction="column">
      <SlotIconName slot={firstSlot} />
      <Flex className={styles.slotItemContent}>
        <SlotClient slot={firstSlot} size="small" />
        <Text>{firstSlot}</Text>
        {countryFlag && <Text>{countryFlag}</Text>}
      </Flex>
    </Flex>
  );
}

export function SlotsPlaceholder({
  width,
  height,
  totalListHeight,
}: {
  width: number;
  height: number;
  totalListHeight: number;
}) {
  const items = useMemo(() => Math.ceil(height / 46), [height]);
  if (totalListHeight < height) return;

  return (
    <Box
      position="absolute"
      width={`${width - 1}px`}
      height={`${height}px`}
      overflow="hidden"
      className={styles.scrollSlotsPlaceholder}
    >
      <div className={clsx(styles.absoluteFullSize, styles.shimmer)} />
      <div className={styles.absoluteFullSize}>
        {Array.from({ length: items }, (_, index) => (
          <MScrollPlaceholderItem key={index} />
        ))}
      </div>
    </Box>
  );
}

export const MScrollPlaceholderItem = memo(function ScrollPlaceholderItem() {
  return <div className={styles.scrollPlaceholderItem} />;
});

function SlotIconName({
  slot,
  iconSize = 15,
}: {
  slot: number;
  iconSize?: number;
}) {
  const { peer, isLeader, name } = useSlotInfo(slot);
  return (
    <Flex gap="4px" minWidth="0">
      <PeerIcon
        url={peer?.info?.icon_url}
        size={iconSize}
        isYou={isLeader}
        hideTooltip
      />
      <Text className={clsx(styles.slotName, styles.ellipsis)}>{name}</Text>
    </Flex>
  );
}

interface SlotStatusesProps {
  firstSlot: number;
  isCurrentSlot?: boolean;
  isPastSlot?: boolean;
}

function SlotStatuses({
  firstSlot,
  isCurrentSlot = false,
  isPastSlot = false,
}: SlotStatusesProps) {
  return (
    <Flex
      className={clsx(styles.slotStatuses, {
        [styles.tall]: isCurrentSlot,
        [styles.short]: !isCurrentSlot && !isPastSlot,
      })}
      direction="column"
      justify="between"
    >
      {Array.from({ length: slotsPerLeader }).map((_, slotIdx) => {
        const slot = firstSlot + (slotsPerLeader - 1) - slotIdx;

        if (isCurrentSlot) {
          return <CurrentSlotStatus key={slotIdx} slot={slot} />;
        }

        if (isPastSlot) {
          return <PastSlotStatus key={slotIdx} slot={slot} />;
        }

        return <SlotStatus key={slotIdx} />;
      })}
    </Flex>
  );
}

function SlotStatus({
  borderColor,
  backgroundColor,
  slotDuration,
}: {
  borderColor?: string;
  backgroundColor?: string;
  slotDuration?: number;
}) {
  return (
    <Flex
      className={styles.slotStatus}
      style={{ borderColor, backgroundColor }}
    >
      {slotDuration && (
        <div
          style={
            { "--slot-duration": `${slotDuration}ms` } as React.CSSProperties
          }
          className={styles.slotStatusProgress}
        />
      )}
    </Flex>
  );
}

function getSlotStatusColorStyles(publish?: SlotPublish): CSSProperties {
  if (!publish) return {};
  if (publish.skipped) return { backgroundColor: slotStatusRed };
  switch (publish.level) {
    case "incomplete":
      return {};
    case "completed":
      return { borderColor: slotStatusGreen };
    case "optimistically_confirmed":
      return { backgroundColor: slotStatusGreen };
    case "finalized":
    case "rooted":
      return { backgroundColor: slotStatusTeal };
  }
}

function CurrentSlotStatus({ slot }: { slot: number }) {
  const currentSlot = useAtomValue(currentSlotAtom);
  const queryPublish = useSlotQueryPublish(slot);
  const slotDuration = useAtomValue(slotDurationAtom);

  const isCurrent = useMemo(() => slot === currentSlot, [slot, currentSlot]);
  const colorStyle = useMemo(() => {
    if (isCurrent) return { borderColor: slotStatusBlue };
    return getSlotStatusColorStyles(queryPublish.publish);
  }, [isCurrent, queryPublish.publish]);

  return (
    <SlotStatus
      borderColor={colorStyle.borderColor}
      backgroundColor={colorStyle.backgroundColor}
      slotDuration={isCurrent ? slotDuration : undefined}
    />
  );
}

function PastSlotStatus({ slot }: { slot: number }) {
  const queryPublish = useSlotQueryPublish(slot);
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const colorStyle = useMemo(() => {
    const style = getSlotStatusColorStyles(queryPublish.publish);
    if (
      queryPublish?.publish?.level === "rooted" &&
      !queryPublish.publish?.skipped &&
      (selectedSlot === undefined ||
        getSlotGroupLeader(slot) !== getSlotGroupLeader(selectedSlot))
    ) {
      style.backgroundColor = slotStatusDullTeal;
    }
    return style;
  }, [queryPublish.publish, selectedSlot, slot]);

  return (
    <SlotStatus
      borderColor={colorStyle.borderColor}
      backgroundColor={colorStyle.backgroundColor}
    />
  );
}
