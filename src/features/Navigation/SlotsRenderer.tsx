import { useAtomValue } from "jotai";
import {
  currentSlotAtom,
  getIsCurrentLeaderAtom,
  getIsFutureLeaderAtom,
  getIsNextLeaderAtom,
  getIsPastLeaderAtom,
  getIsPreviousLeaderAtom,
  getSlotStatus,
  slotDurationAtom,
} from "../../atoms";
import { Box, Flex, Text } from "@radix-ui/themes";
import { useSlotQueryPublish } from "../../hooks/useSlotQuery";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./slotsRenderer.module.css";
import PeerIcon from "../../components/PeerIcon";
import { slotsPerLeader } from "../../consts";
import { useSlotInfo } from "../../hooks/useSlotInfo";
import clsx from "clsx";
import { Link } from "@tanstack/react-router";
import { getSlotGroupLeader, slotLevelToColor } from "../../utils";
import { selectedSlotAtom } from "../Overview/SlotPerformance/atoms";
import { SlotClient } from "../../components/SlotClient";
import { slotStatusBlue, slotStatusRed } from "../../colors";

type UpdateSlotSkipStatusFunc = (slot: number, skipped: boolean) => void;

export function SlotsRenderer({
  leaderSlotForGroup,
}: {
  leaderSlotForGroup: number;
}) {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const { isLeader: isYou } = useSlotInfo(leaderSlotForGroup);

  const isPastLeader = useAtomValue(
    useMemo(
      () => getIsPastLeaderAtom(leaderSlotForGroup),
      [leaderSlotForGroup],
    ),
  );
  const isCurrentLeader = useAtomValue(
    useMemo(
      () => getIsCurrentLeaderAtom(leaderSlotForGroup),
      [leaderSlotForGroup],
    ),
  );
  const isPreviousLeader = useAtomValue(
    useMemo(
      () => getIsPreviousLeaderAtom(leaderSlotForGroup),
      [leaderSlotForGroup],
    ),
  );
  const isNextLeader = useAtomValue(
    useMemo(
      () => getIsNextLeaderAtom(leaderSlotForGroup),
      [leaderSlotForGroup],
    ),
  );
  const isFutureLeader = useAtomValue(
    useMemo(
      () => getIsFutureLeaderAtom(leaderSlotForGroup),
      [leaderSlotForGroup],
    ),
  );
  const isSelectedLeader = useMemo(() => {
    return (
      selectedSlot !== undefined &&
      getSlotGroupLeader(selectedSlot) === leaderSlotForGroup
    );
  }, [leaderSlotForGroup, selectedSlot]);
  const [slotSkipStatuses, setSlotSkipStatuses] = useState(
    Array(slotsPerLeader).fill(false),
  );
  const updateSlotSkipStatus: UpdateSlotSkipStatusFunc = useCallback(
    (slot, skipped) =>
      setSlotSkipStatuses((prevStatus: boolean[]) =>
        prevStatus.map((s, i) =>
          leaderSlotForGroup + i === slot ? skipped : s,
        ),
      ),
    [leaderSlotForGroup],
  );
  const hasSkipped = useMemo(
    () => slotSkipStatuses.some((s) => s),
    [slotSkipStatuses],
  );

  return (
    <Box className={styles.slotGroupContainer}>
      <Box className={styles.slotBorder}>
        <Link
          to="/slotDetails"
          search={{ slot: leaderSlotForGroup }}
          style={{ textDecoration: "none" }}
          disabled={!isYou || isFutureLeader}
        >
          <Box
            className={clsx(
              styles.slotGroup,
              isCurrentLeader && styles.currentSlotGroup,
              isNextLeader && styles.nextSlotGroup,
              isPreviousLeader && styles.previousSlotGroup,
              isFutureLeader && styles.futureSlotGroup,
              isPastLeader && styles.pastSlotGroup,
              isSelectedLeader && styles.selectedSlotGroup,
              hasSkipped && styles.skippedSlotGroup,
              isYou && styles.yourSlotGroup,
            )}
          >
            <Flex
              width="100%"
              height="100%"
              overflow="hidden"
              gap="4px"
              className={styles.slotContent}
            >
              <Flex
                direction="column"
                width="100%"
                height="100%"
                overflow="hidden"
                gap="4px"
                justify="start"
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
                {isCurrentLeader && (
                  <Flex className={styles.slotRow}>
                    <CurrentSlot />
                  </Flex>
                )}
              </Flex>
              {isCurrentLeader ? (
                <ExpandedSlotGroupStatus
                  slot={leaderSlotForGroup}
                  updateSlotSkipStatus={updateSlotSkipStatus}
                />
              ) : (
                <CompactSlotGroupStatusRenderer
                  slot={leaderSlotForGroup}
                  updateSlotSkipStatus={updateSlotSkipStatus}
                />
              )}
            </Flex>
          </Box>
        </Link>
      </Box>
    </Box>
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
      position="fixed"
      width={`${width - 1}px`}
      height={`${height}px`}
      overflow="hidden"
    >
      {Array.from({ length: items }, (_, index) => (
        <ScrollPlaceholderItem key={index} />
      ))}
    </Box>
  );
}

function ScrollPlaceholderItem() {
  return (
    <Box height="46px" className={styles.slotGroupContainer}>
      <Box className={styles.slotBorder}>
        <Box className={clsx(styles.slotGroup, styles.scrollPlaceholderItem)} />
      </Box>
    </Box>
  );
}

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
        style={{ borderRadius: "6px" }}
      />
      <Text className={styles.slotGroupName}>{name}</Text>
    </Flex>
  );
}

function SlotVersion({ slot }: { slot: number }) {
  const { client, version } = useSlotInfo(slot);
  if (!version) return;
  return (
    <Text
      size="1"
      style={{ color: client === "Frankendancer" ? "#1E9580" : "#ad5dc4" }}
    >{`v${version}`}</Text>
  );
}

function CurrentSlot() {
  const currentSlot = useAtomValue(currentSlotAtom);
  return <Text align="center">{currentSlot}</Text>;
}

function ExpandedSlotGroupStatus({
  slot,
  updateSlotSkipStatus,
}: {
  slot: number;
  updateSlotSkipStatus: UpdateSlotSkipStatusFunc;
}) {
  return (
    <Flex direction="column" gap="4px" justify="between" pt="1" pb="1">
      {Array.from({ length: slotsPerLeader }).map((_, slotIdx) => {
        const slotNumber = slot + (slotsPerLeader - 1) - slotIdx;
        return (
          <ExpandedSlotStatus
            key={slotIdx}
            slot={slotNumber}
            updateSlotSkipStatus={updateSlotSkipStatus}
          />
        );
      })}
    </Flex>
  );
}

function ExpandedSlotStatus({
  slot,
  updateSlotSkipStatus,
}: {
  slot: number;
  updateSlotSkipStatus: UpdateSlotSkipStatusFunc;
}) {
  const currentSlot = useAtomValue(currentSlotAtom);
  const queryPublish = useSlotQueryPublish(slot);
  const slotDuration = useAtomValue(slotDurationAtom);

  const status = useAtomValue(useMemo(() => getSlotStatus(slot), [slot]));
  const isCurrent = useMemo(() => slot === currentSlot, [slot, currentSlot]);
  const colorStyle = useMemo(() => {
    if (isCurrent) return { borderColor: slotStatusBlue };
    if (queryPublish.publish?.skipped)
      return { backgroundColor: slotStatusRed };
    const color = slotLevelToColor(status);
    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
    switch (status) {
      case "incomplete":
        return {};
      case "completed":
        return { borderColor: color };
      default:
        return { backgroundColor: color };
    }
  }, [isCurrent, queryPublish.publish?.skipped, status]);

  useEffect(() => {
    updateSlotSkipStatus(slot, Boolean(queryPublish.publish?.skipped));
  }, [queryPublish.publish?.skipped, slot, updateSlotSkipStatus]);

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

function CompactSlotGroupStatusRenderer({
  slot,
  updateSlotSkipStatus,
}: {
  slot: number;
  updateSlotSkipStatus: UpdateSlotSkipStatusFunc;
}) {
  return (
    <Flex direction="column" gap="2px" justify="center">
      {Array.from({ length: slotsPerLeader }).map((_, slotIdx) => {
        const slotNumber = slot + (slotsPerLeader - 1) - slotIdx;
        return (
          <CompactSlotStatus
            key={slotIdx}
            slot={slotNumber}
            updateSlotSkipStatus={updateSlotSkipStatus}
          />
        );
      })}
    </Flex>
  );
}

function CompactSlotStatus({
  slot,
  updateSlotSkipStatus,
}: {
  slot: number;
  updateSlotSkipStatus: UpdateSlotSkipStatusFunc;
}) {
  const currentSlot = useAtomValue(currentSlotAtom);
  const queryPublish = useSlotQueryPublish(slot);
  const status = useAtomValue(useMemo(() => getSlotStatus(slot), [slot]));
  const isCurrent = useMemo(() => slot === currentSlot, [slot, currentSlot]);
  const backgroundColor = useMemo(() => {
    if (isCurrent) return slotStatusBlue;
    if (queryPublish.publish?.skipped) return slotStatusRed;
    return slotLevelToColor(status);
  }, [isCurrent, queryPublish.publish?.skipped, status]);

  useEffect(() => {
    updateSlotSkipStatus(slot, Boolean(queryPublish.publish?.skipped));
  }, [queryPublish.publish?.skipped, slot, updateSlotSkipStatus]);

  return (
    <div style={{ backgroundColor }} className={styles.compactSlotStatus} />
  );
}
