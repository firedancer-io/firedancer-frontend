import { atom, useAtomValue } from "jotai";
import {
  currentLeaderSlotAtom,
  currentSlotAtom,
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
import { getSlotGroupLeader, slotLevelToColor } from "../../utils";
import { selectedSlotAtom } from "../Overview/SlotPerformance/atoms";
import { slotStatusBlue, slotStatusRed } from "../../colors";
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
  if (currentLeaderSlot === undefined) return;

  return function getStatus(slot: number) {
    return {
      isCurrentLeader:
        currentLeaderSlot <= slot && slot < currentLeaderSlot + slotsPerLeader,
      isPreviousLeader:
        currentLeaderSlot - slotsPerLeader <= slot && slot < currentLeaderSlot,
      isNextLeader:
        currentLeaderSlot + slotsPerLeader <= slot &&
        slot < currentLeaderSlot + 2 * slotsPerLeader,
      isFutureLeader: currentLeaderSlot + slotsPerLeader <= slot,
      isPastLeader: slot < currentLeaderSlot,
    };
  };
});

const MSlotsRenderer = function SlotsRenderer({
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

  const {
    isFutureLeader,
    isCurrentLeader,
    isNextLeader,
    isPreviousLeader,
    isPastLeader,
  } = status;

  return (
    <div className={styles.slotGroupContainer}>
      <div className={styles.slotBorder}>
        <Link
          to="/slotDetails"
          search={{ slot: leaderSlotForGroup }}
          className={styles.link}
          disabled={!isYou || isFutureLeader}
        >
          <Flex
            className={clsx(styles.slotGroup, {
              [styles.currentSlotGroup]: isCurrentLeader,
              [styles.nextSlotGroup]: isNextLeader,
              [styles.previousSlotGroup]: isPreviousLeader,
              [styles.futureSlotGroup]: isFutureLeader,
              [styles.pastSlotGroup]: isPastLeader,
              [styles.selectedSlotGroup]: isSelectedLeader,
              [styles.skippedSlotGroup]: hasSkipped,
              [styles.yourSlotGroup]: isYou,
            })}
            gap="4px"
          >
            <Flex
              direction="column"
              overflow="hidden"
              gap="4px"
              className={styles.slotContent}
              flexGrow="1"
            >
              <SlotGroupHeader
                slot={leaderSlotForGroup}
                iconSize={isCurrentLeader ? 22 : 15}
              />
              <Flex gap="4px" className={styles.slotItemContent}>
                {(isPastLeader || isCurrentLeader || isNextLeader) && (
                  <SlotClient slot={leaderSlotForGroup} />
                )}
                {isCurrentLeader && <SlotVersion slot={leaderSlotForGroup} />}
                {isPastLeader && <Text>{leaderSlotForGroup}</Text>}
              </Flex>
              {isCurrentLeader && <CurrentSlot />}
            </Flex>
            {!isFutureLeader &&
              (isCurrentLeader ? (
                <ExpandedSlotGroupStatus slot={leaderSlotForGroup} />
              ) : (
                <CompactSlotGroupStatusRenderer slot={leaderSlotForGroup} />
              ))}
          </Flex>
        </Link>
      </div>
    </div>
  );
};

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
      position="fixed"
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
    // why 3 divs
    <Box height="46px" className={styles.slotGroupContainer}>
      <div className={styles.slotBorder}>
        <div className={clsx(styles.slotGroup, styles.scrollPlaceholderItem)} />
      </div>
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
    <Flex gap="1" className={styles.slotHeader}>
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

const SlotVersion = memo(function SlotVersion({ slot }: { slot: number }) {
  const { client, version } = useSlotInfo(slot);
  if (!version) return;
  return (
    <Text
      size="1"
      className={
        client === "Frankendancer" ? styles.Frankendancer : styles.other
      }
    >
      v{version}
    </Text>
  );
});

function CurrentSlot() {
  const currentSlot = useAtomValue(currentSlotAtom);
  return (
    <Text align="center" className={styles.slotRow}>
      {currentSlot}
    </Text>
  );
}

function ExpandedSlotGroupStatus({ slot }: { slot: number }) {
  return (
    <Flex direction="column" gap="4px" justify="between" pt="1" pb="1">
      {Array.from({ length: slotsPerLeader }).map((_, slotIdx) => {
        const slotNumber = slot + (slotsPerLeader - 1) - slotIdx;
        return <ExpandedSlotStatus key={slotIdx} slot={slotNumber} />;
      })}
    </Flex>
  );
}

function ExpandedSlotStatus({ slot }: { slot: number }) {
  const currentSlot = useAtomValue(currentSlotAtom);
  const queryPublish = useSlotQueryPublish(slot);
  const slotDuration = useAtomValue(slotDurationAtom);

  const isCurrent = useMemo(() => slot === currentSlot, [slot, currentSlot]);
  const colorStyle = useMemo(() => {
    if (!queryPublish.publish) return {};
    if (isCurrent) return { borderColor: slotStatusBlue };
    if (queryPublish.publish.skipped) return { backgroundColor: slotStatusRed };
    const color = slotLevelToColor(queryPublish.publish.level);
    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
    switch (queryPublish.publish.level) {
      case "incomplete":
        return {};
      case "completed":
        return { borderColor: color };
      default:
        return { backgroundColor: color };
    }
  }, [isCurrent, queryPublish.publish]);

  return (
    <Flex
      width="4px"
      height="100%"
      style={{ ...colorStyle }}
      className={styles.expandedSlotStatus}
    >
      {isCurrent && (
        <div
          style={
            { "--slot-duration": `${slotDuration}ms` } as React.CSSProperties
          }
          className={styles.currentSlotStatusProgress}
        />
      )}
    </Flex>
  );
}

function CompactSlotGroupStatusRenderer({ slot }: { slot: number }) {
  return (
    <Flex direction="column" gap="2px" justify="center">
      {Array.from({ length: slotsPerLeader }).map((_, slotIdx) => {
        const slotNumber = slot + (slotsPerLeader - 1) - slotIdx;
        return <CompactSlotStatus key={slotIdx} slot={slotNumber} />;
      })}
    </Flex>
  );
}

function CompactSlotStatus({ slot }: { slot: number }) {
  const queryPublish = useSlotQueryPublish(slot);
  const backgroundColor = useMemo(() => {
    if (!queryPublish.publish) return "gray";
    if (queryPublish.publish.skipped) return slotStatusRed;
    return slotLevelToColor(queryPublish.publish.level);
  }, [queryPublish.publish]);

  return (
    <div
      style={{ "--color": backgroundColor } as React.CSSProperties}
      className={styles.compactSlotStatus}
    />
  );
}
