import { useAtomValue } from "jotai";
import { currentSlotAtom, slotDurationAtom } from "../../atoms";
import { Box, Flex, Text } from "@radix-ui/themes";
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
import {
  slotStatusBlue,
  slotStatusDullTeal,
  slotStatusGreen,
  slotStatusRed,
  slotStatusTeal,
} from "../../colors";
import SlotClient from "../../components/SlotClient";
import { useIsLeaderGroupSkipped } from "../../hooks/useIsLeaderGroupSkipped";
import {
  getIsGroupSelectedAtom,
  getSlotGroupTypeAtom,
  isScrollingAtom,
  SlotGroupType,
} from "./atoms";
import useNextSlot from "../../hooks/useNextSlot";
import type { SlotPublish } from "../../api/types";
import AnimatedInteger from "../../components/AnimatedInteger";
import Progress from "../../components/Progress";

interface SlotsRendererProps {
  leaderSlotForGroup: number;
}
export default function SlotsRenderer({
  leaderSlotForGroup,
}: SlotsRendererProps) {
  const isScrolling = useAtomValue(isScrollingAtom);
  const getIsGroupSelected = useAtomValue(getIsGroupSelectedAtom);
  // NOTE: getSlotGroupType changes on current slot change
  const getSlotGroupType = useAtomValue(getSlotGroupTypeAtom);

  if (isScrolling) return <MPlaceholder />;

  const groupType = getSlotGroupType?.(leaderSlotForGroup);
  if (groupType == null) return <MPlaceholder />;

  return (
    <MSlotsRendererInner
      leaderSlotForGroup={leaderSlotForGroup}
      groupType={groupType}
      isSelected={getIsGroupSelected(leaderSlotForGroup)}
    />
  );
}

const MPlaceholder = memo(function Placeholder() {
  return <div className={styles.placeholder} />;
});

interface SlotsRendererInnerProps {
  leaderSlotForGroup: number;
  groupType: SlotGroupType;
  isSelected: boolean;
}
const MSlotsRendererInner = memo(function SlotsRendererInner({
  leaderSlotForGroup,
  groupType,
  isSelected,
}: SlotsRendererInnerProps) {
  return (
    <div className={styles.slotGroupContainer}>
      {groupType === SlotGroupType.Current ? (
        <CurrentLeaderSlotGroup firstSlot={leaderSlotForGroup} />
      ) : groupType === SlotGroupType.FutureYourNext ? (
        <YourNextLeaderSlotGroup firstSlot={leaderSlotForGroup} />
      ) : groupType === SlotGroupType.FutureNotYourNext ? (
        <FutureSlotGroup firstSlot={leaderSlotForGroup} />
      ) : groupType === SlotGroupType.PastProcessed ||
        groupType === SlotGroupType.PastUnprocessed ? (
        <MPastSlotGroup
          firstSlot={leaderSlotForGroup}
          isProcessed={groupType === SlotGroupType.PastProcessed}
          isSelected={isSelected}
        />
      ) : null}
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
      className={clsx(
        styles.slotGroup,
        styles.future,
        styles.you,
        styles.nextYou,
      )}
    >
      <Flex justify="between" gap="2px">
        <MSlotIconName slot={firstSlot} />

        <Flex gap="3px" flexShrink="0">
          <Text className={styles.slotName}>{nextSlotText}</Text>
          <MSlotStatuses firstSlot={firstSlot} />
        </Flex>
      </Flex>

      <Progress value={progressSinceLastLeader} height="2px" />
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
      <MSlotIconName slot={firstSlot} />
      <MSlotStatuses firstSlot={firstSlot} />
    </Flex>
  );
}

function CurrentLeaderSlotGroup({ firstSlot }: { firstSlot: number }) {
  const { isLeader: isYou, countryFlag } = useSlotInfo(firstSlot);
  const hasSkipped = useIsLeaderGroupSkipped(firstSlot);
  return (
    <Flex
      justify="between"
      className={clsx(styles.slotGroup, styles.current, {
        [styles.you]: isYou,
        [styles.skipped]: hasSkipped,
      })}
    >
      <Flex direction="column" className={styles.leftColumn}>
        <MSlotIconName slot={firstSlot} iconSize={22} />
        <Flex gap="1" align="center" className={styles.currentSlotRow}>
          <MSlotFlag flag={countryFlag} width="13px" />
          <MCurrentSlot />
          <SlotClient slot={firstSlot} size="small" />
        </Flex>
      </Flex>

      <MSlotStatuses firstSlot={firstSlot} isCurrentSlot />
    </Flex>
  );
}

const MCurrentSlot = memo(function CurrentSlot() {
  const currentSlot = useAtomValue(currentSlotAtom);
  if (currentSlot == null) return null;
  return <AnimatedInteger value={currentSlot} height={12} />;
});

interface PastSlotGroupProps extends SlotGroupProps {
  isProcessed: boolean;
  isSelected: boolean;
}
const MPastSlotGroup = memo(function PastSlotGroup({
  firstSlot,
  isProcessed,
  isSelected,
}: PastSlotGroupProps) {
  const { isLeader: isYou, countryFlag } = useSlotInfo(firstSlot);
  const hasSkipped = useIsLeaderGroupSkipped(firstSlot);
  const canBeSelected = isYou && isProcessed;
  const showAsSelected = canBeSelected && isSelected;

  const content = useMemo(() => {
    return (
      <>
        <Flex className={styles.leftColumn} direction="column">
          <MSlotIconName slot={firstSlot} />
          <Flex className={styles.slotItemContent}>
            <MSlotFlag flag={countryFlag} width="15px" />
            <Text>{firstSlot}</Text>
            <SlotClient slot={firstSlot} size="small" />
          </Flex>
        </Flex>
        <MSlotStatuses firstSlot={firstSlot} isPastSlot />
      </>
    );
  }, [countryFlag, firstSlot]);

  return (
    <Flex
      className={clsx(styles.slotGroup, styles.past, {
        [styles.you]: isYou,
        [styles.processed]: isProcessed,
        [styles.skipped]: hasSkipped,
        [styles.selected]: showAsSelected,
      })}
      asChild={canBeSelected}
    >
      {canBeSelected ? (
        <Link to="/slotDetails" search={{ slot: firstSlot }}>
          {content}
        </Link>
      ) : (
        content
      )}
    </Flex>
  );
});

export const MSlotsPlaceholder = memo(function SlotsPlaceholder({
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
      className={styles.scrollSlotsPlaceholder}
    >
      <div className={clsx(styles.absoluteFullSize, styles.shimmer)} />
      <div className={styles.absoluteFullSize}>
        {Array.from({ length: items }, (_, index) => (
          <div key={index} className={styles.scrollPlaceholderItem} />
        ))}
      </div>
    </Box>
  );
});

const MSlotIconName = memo(function SlotIconName({
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
});

const MSlotFlag = memo(function SlotFlag({
  flag,
  width,
}: {
  flag?: string;
  width: string;
}) {
  return <Flex width={width}>{flag && <Text>{flag}</Text>}</Flex>;
});

interface SlotStatusesProps {
  firstSlot: number;
  isCurrentSlot?: boolean;
  isPastSlot?: boolean;
}

const MSlotStatuses = memo(function SlotStatuses({
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

        return <MSlotStatus key={slotIdx} />;
      })}
    </Flex>
  );
});

const MSlotStatus = memo(function SlotStatus({
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
});

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
    <MSlotStatus
      borderColor={colorStyle.borderColor}
      backgroundColor={colorStyle.backgroundColor}
      slotDuration={isCurrent ? slotDuration : undefined}
    />
  );
}

function PastSlotStatus({ slot }: { slot: number }) {
  const queryPublish = useSlotQueryPublish(slot);
  const getIsGroupSelected = useAtomValue(getIsGroupSelectedAtom);
  const colorStyle = useMemo(() => {
    const style = getSlotStatusColorStyles(queryPublish.publish);
    if (
      queryPublish?.publish?.level === "rooted" &&
      !queryPublish.publish?.skipped &&
      !getIsGroupSelected(slot)
    ) {
      style.backgroundColor = slotStatusDullTeal;
    }
    return style;
  }, [getIsGroupSelected, queryPublish.publish, slot]);

  return (
    <MSlotStatus
      borderColor={colorStyle.borderColor}
      backgroundColor={colorStyle.backgroundColor}
    />
  );
}
