import { atom, useAtomValue } from "jotai";
import {
  currentLeaderSlotAtom,
  currentSlotAtom,
  earliestProcessedSlotLeaderAtom,
  slotDurationAtom,
} from "../../atoms";
import { Box, Flex, Text } from "@radix-ui/themes";
import { useSlotQueryPublish } from "../../hooks/useSlotQuery";
import type React from "react";
import { memo, useMemo } from "react";
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
  slotStatusGray,
  slotStatusGreen,
  slotStatusRed,
  slotStatusTeal,
} from "../../colors";
import SlotClient from "../../components/SlotClient";
import { useIsLeaderGroupSkipped } from "../../hooks/useIsLeaderGroupSkipped";
import { isScrollingAtom } from "./atoms";

export default function SlotsRenderer(props: { leaderSlotForGroup: number }) {
  const isScrolling = useAtomValue(isScrollingAtom);
  if (isScrolling) return <div className={styles.placeholder} />;

  return <MSlotsRenderer {...props}></MSlotsRenderer>;
}

const getStatusAtom = atom((get) => {
  const currentLeaderSlot = get(currentLeaderSlotAtom);
  const earliestProcessedSlotLeader = get(earliestProcessedSlotLeaderAtom);
  if (
    currentLeaderSlot === undefined ||
    earliestProcessedSlotLeader === undefined
  )
    return;

  return function getStatus(slot: number) {
    return {
      isCurrentLeader:
        currentLeaderSlot <= slot && slot < currentLeaderSlot + slotsPerLeader,
      isFutureLeader: currentLeaderSlot + slotsPerLeader <= slot,
      isPastLeader: slot < currentLeaderSlot,
      isProcessedLeader:
        earliestProcessedSlotLeader <= slot && slot <= currentLeaderSlot,
    };
  };
});

const MSlotsRenderer = memo(function SlotsRenderer({
  leaderSlotForGroup,
}: {
  leaderSlotForGroup: number;
}) {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const { isLeader: isYou } = useSlotInfo(leaderSlotForGroup);
  const hasSkipped = useIsLeaderGroupSkipped(leaderSlotForGroup);
  const getStatus = useAtomValue(getStatusAtom);
  const status = getStatus?.(leaderSlotForGroup);
  if (!status) return;

  const isSelectedLeader =
    selectedSlot !== undefined &&
    getSlotGroupLeader(selectedSlot) === leaderSlotForGroup;

  const { isFutureLeader, isCurrentLeader, isPastLeader, isProcessedLeader } =
    status;

  return (
    <div className={styles.slotGroupContainer}>
      <Link
        to="/slotDetails"
        search={{ slot: leaderSlotForGroup }}
        className={styles.link}
        disabled={!isYou || !isProcessedLeader}
      >
        <Flex
          className={clsx(styles.slotGroup, {
            [styles.futureSlotGroup]: isFutureLeader,
            [styles.currentSlotGroup]: isCurrentLeader,
            [styles.pastSlotGroup]: isPastLeader,
            [styles.selectedSlotGroup]: isSelectedLeader,
            [styles.skippedSlotGroup]: hasSkipped,
            [styles.yourSlotGroup]: isYou,
            [styles.processedSlotGroup]: isProcessedLeader,
          })}
        >
          {isFutureLeader && <FutureSlotContent slot={leaderSlotForGroup} />}
          {isCurrentLeader && <CurrentSlotContent slot={leaderSlotForGroup} />}
          {isPastLeader && <PastSlotContent slot={leaderSlotForGroup} />}
        </Flex>
      </Link>
    </div>
  );
});

function CurrentSlotContent({ slot }: { slot: number }) {
  const currentSlot = useAtomValue(currentSlotAtom);

  return (
    <>
      <Flex className={styles.slotContent}>
        <SlotGroupHeader slot={slot} iconSize={22} />
        <Text className={styles.slotNumber}>{currentSlot}</Text>
      </Flex>
      <Flex direction="column" gap="3px">
        {Array.from({ length: slotsPerLeader }).map((_, slotIdx) => {
          const slotNumber = slot + (slotsPerLeader - 1) - slotIdx;
          return <ExpandedSlotStatus key={slotIdx} slot={slotNumber} />;
        })}
      </Flex>
    </>
  );
}

function PastSlotContent({ slot }: { slot: number }) {
  return (
    <>
      <Flex className={styles.slotContent}>
        <SlotGroupHeader slot={slot} iconSize={16} />
        <Flex className={styles.slotItemContent}>
          <SlotClient slot={slot} size="small" />
          <Text className={styles.slotNumber}>{slot}</Text>
        </Flex>
      </Flex>
      <Flex direction="column" gap="2px" justify="center">
        {Array.from({ length: slotsPerLeader }).map((_, slotIdx) => {
          const slotNumber = slot + (slotsPerLeader - 1) - slotIdx;
          return <CompactSlotStatus key={slotIdx} slot={slotNumber} />;
        })}
      </Flex>
    </>
  );
}

function FutureSlotContent({ slot }: { slot: number }) {
  return (
    <>
      <Flex className={styles.slotContent}>
        <SlotGroupHeader slot={slot} iconSize={16} />
      </Flex>
      <Flex direction="column" gap="2px" justify="center">
        {Array.from({ length: slotsPerLeader }).map((_, slotIdx) => {
          return <SlotStatus key={slotIdx} backgroundColor={slotStatusGray} />;
        })}
      </Flex>
    </>
  );
}

export function SlotsPlaceholder({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const items = useMemo(() => Math.ceil(height / 46), [height]);

  return (
    <Box
      position="absolute"
      width={`${width - 1}px`}
      height={`${height}px`}
      overflow="hidden"
    >
      {Array.from({ length: items }, (_, index) => (
        <MScrollPlaceholderItem key={index} />
      ))}
    </Box>
  );
}

export const MScrollPlaceholderItem = memo(function ScrollPlaceholderItem() {
  return (
    <Box height="46px" className={styles.slotGroupContainer}>
      <div className={clsx(styles.slotGroup, styles.scrollPlaceholderItem)} />
    </Box>
  );
});

function SlotGroupHeader({
  slot,
  iconSize = 15,
}: {
  slot: number;
  iconSize?: number;
}) {
  const { peer, isLeader, name } = useSlotInfo(slot);
  return (
    <Flex className={styles.slotHeader}>
      <PeerIcon
        url={peer?.info?.icon_url}
        size={iconSize}
        isYou={isLeader}
        isRounded
      />
      <Text className={styles.slotGroupName}>{name}</Text>
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

function ExpandedSlotStatus({ slot }: { slot: number }) {
  const currentSlot = useAtomValue(currentSlotAtom);
  const queryPublish = useSlotQueryPublish(slot);
  const slotDuration = useAtomValue(slotDurationAtom);

  const isCurrent = useMemo(() => slot === currentSlot, [slot, currentSlot]);
  const colorStyle = useMemo(() => {
    if (isCurrent) return { borderColor: slotStatusBlue };
    if (!queryPublish.publish) return { backgroundColor: slotStatusGray };
    if (queryPublish.publish.skipped) return { backgroundColor: slotStatusRed };
    switch (queryPublish.publish.level) {
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
  }, [isCurrent, queryPublish.publish]);

  return (
    <SlotStatus
      borderColor={colorStyle.borderColor}
      backgroundColor={colorStyle.backgroundColor}
      slotDuration={isCurrent ? slotDuration : undefined}
    />
  );
}

function CompactSlotStatus({ slot }: { slot: number }) {
  const queryPublish = useSlotQueryPublish(slot);
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const backgroundColor = useMemo(() => {
    if (!queryPublish.publish) return slotStatusGray;
    if (queryPublish.publish.skipped) return slotStatusRed;
    switch (queryPublish.publish.level) {
      case "incomplete":
        return slotStatusGray;
      case "completed":
        return slotStatusGreen;
      case "optimistically_confirmed":
        return slotStatusGreen;
      case "finalized":
      case "rooted":
        if (
          selectedSlot !== undefined &&
          getSlotGroupLeader(slot) === getSlotGroupLeader(selectedSlot)
        ) {
          return slotStatusTeal;
        }
        return slotStatusDullTeal;
    }
  }, [queryPublish.publish, selectedSlot, slot]);

  return <SlotStatus backgroundColor={backgroundColor} />;
}
