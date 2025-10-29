import { Box, Flex, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import type React from "react";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { selectedSlotAtom } from "../Overview/SlotPerformance/atoms";
import {
  firstProcessedSlotAtom,
  lastProcessedLeaderAtom,
  leaderSlotsAtom,
} from "../../atoms";
import {
  clusterIndicatorHeight,
  headerHeight,
  maxZIndex,
  slotNavHeight,
  slotsPerLeader,
} from "../../consts";
import { useMeasure } from "react-use";
import { Link } from "@tanstack/react-router";
import styles from "./slotNavigation.module.css";
import clsx from "clsx";
import MeasureOffscreen from "../../components/MeasureOffscreen";
import { skippedSlotsAtom } from "../../api/atoms";
import { SkippedIcon, StatusIcon } from "../../components/StatusIcon";
import { useSlotQueryPublish } from "../../hooks/useSlotQuery";
import { getSlotGroupLeader } from "../../utils";
import { clamp } from "lodash";

const navigationTop = clusterIndicatorHeight + headerHeight;
const itemGroupContainerGap = 4;

function getSpacerWidth(groupCount: number, itemGroupWidth: number) {
  return (
    groupCount * itemGroupWidth +
    // Adds n-1 gaps for n groups as itemGroupWidth only measures the width of the groups themselves
    Math.max(0, groupCount - 1) * itemGroupContainerGap
  );
}

export default function SlotNavigation() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const leaderSlots = useAtomValue(leaderSlotsAtom);
  const [itemWidth, setItemWidth] = useState(0);
  const [itemGroupWidth, setItemGroupWidth] = useState(0);
  const [measureRef, { width: containerWidth }] = useMeasure<HTMLDivElement>();
  const trackElRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  const centerSelectedSlotItem = useCallback(
    (el: HTMLAnchorElement | null) => {
      if (!el) return;
      requestAnimationFrame(() => {
        const offset =
          containerWidth / 2 - (el.offsetLeft + el.offsetWidth / 2);
        trackElRef.current?.style.setProperty("--offset", `${offset}px`);
        setOffset(offset);
      });
    },
    [containerWidth],
  );

  const slotGroupLeaderIdx = useMemo(() => {
    if (selectedSlot === undefined || !leaderSlots) return -1;
    return leaderSlots.indexOf(getSlotGroupLeader(selectedSlot));
  }, [leaderSlots, selectedSlot]);

  const calcs = useMemo(() => {
    if (slotGroupLeaderIdx < 0 || !leaderSlots) return;

    const viewportGroupsEachSide = Math.max(
      1,
      Math.ceil(containerWidth / 2 / itemGroupWidth),
    );
    const overscanGroupsEachSide = clamp(viewportGroupsEachSide, 1, 10);
    const itemGroupsEachSide = viewportGroupsEachSide + overscanGroupsEachSide;
    const totalItemGroups = leaderSlots.length;

    const startItemGroupIdx = Math.max(
      0,
      slotGroupLeaderIdx - itemGroupsEachSide,
    );
    const endItemGroupIdx = Math.min(
      totalItemGroups - 1,
      slotGroupLeaderIdx + itemGroupsEachSide,
    );

    const rightGroups = totalItemGroups - 1 - endItemGroupIdx;

    return {
      leftSpacerWidth: getSpacerWidth(startItemGroupIdx, itemGroupWidth),
      rightSpacerWidth: getSpacerWidth(rightGroups, itemGroupWidth),
      startItemGroupIdx,
      endItemGroupIdx,
    };
  }, [containerWidth, itemGroupWidth, leaderSlots, slotGroupLeaderIdx]);

  const { showFadeLeft, showFadeRight } = useMemo(() => {
    const showFadeLeft = offset < 0;
    const showFadeRight =
      (trackElRef.current?.offsetWidth ?? 0) - containerWidth + offset > 0;
    return { showFadeLeft, showFadeRight };
  }, [containerWidth, offset]);

  if (!leaderSlots || !calcs || selectedSlot === undefined) return;

  const navItemGroups = [];

  if (itemGroupWidth && itemWidth) {
    for (let i = calcs.startItemGroupIdx; i <= calcs.endItemGroupIdx; i++) {
      const navItemGroup = [];
      const leaderSlot = leaderSlots[i];

      for (let j = 0; j < slotsPerLeader; j++) {
        const slot = leaderSlot + j;
        const isSelected = slot === selectedSlot;
        navItemGroup.push(
          <SlotNavItem
            key={slot}
            slot={slot}
            isSelected={isSelected}
            onSelectedSlotRef={isSelected ? centerSelectedSlotItem : undefined}
          />,
        );
      }

      const isGroupSelected =
        leaderSlot <= selectedSlot &&
        selectedSlot < leaderSlot + slotsPerLeader;

      navItemGroups.push(
        <SlotNavItemGroup
          key={leaderSlot}
          slot={leaderSlot}
          isSelected={isGroupSelected}
        >
          {navItemGroup}
        </SlotNavItemGroup>,
      );
    }
  }

  return (
    <>
      <Flex
        className="sticky"
        top={`${navigationTop}px`}
        overflow="hidden"
        position="relative"
        ref={measureRef}
        style={{
          zIndex: maxZIndex - 3,
          height: `${slotNavHeight}px`,
        }}
      >
        <Flex
          ref={trackElRef}
          style={
            {
              willChange: "transform",
              transition: "transform 300ms ease",
              transform: `translateX(var(--offset, ${offset}px))`,
              gap: `${itemGroupContainerGap}px`,
              ["--item-width"]: `${itemWidth}px`,
            } as React.CSSProperties
          }
        >
          <Box width={`${calcs.leftSpacerWidth}px`} />
          {navItemGroups}
          <Box width={`${calcs.rightSpacerWidth}px`} />
        </Flex>
        {showFadeLeft && (
          <div
            className={clsx(styles.fade, styles.fadeLeft)}
            aria-hidden="true"
          />
        )}
        {showFadeRight && (
          <div
            className={clsx(styles.fade, styles.fadeRight)}
            aria-hidden="true"
          />
        )}
      </Flex>
      <MeasureItems
        leaderSlots={leaderSlots}
        setItemWidth={setItemWidth}
        setItemGroupWidth={setItemGroupWidth}
      />
    </>
  );
}

interface MeasureItemsProps {
  leaderSlots: number[];
  setItemWidth: (width: number) => void;
  setItemGroupWidth: (width: number) => void;
}

function MeasureItems({
  leaderSlots,
  setItemWidth,
  setItemGroupWidth,
}: MeasureItemsProps) {
  const lastEpochSlot = leaderSlots[leaderSlots.length - 1];
  return (
    <>
      <MeasureOffscreen onMeasured={(rect) => setItemWidth(rect.width)}>
        <SlotNavItem slot={leaderSlots[leaderSlots.length - 1]} isSelected />
      </MeasureOffscreen>
      <MeasureOffscreen onMeasured={(rect) => setItemGroupWidth(rect.width)}>
        <SlotNavItemGroup slot={lastEpochSlot}>
          {new Array(slotsPerLeader).fill(0).map((_, idx) => (
            <SlotNavItem key={idx} slot={lastEpochSlot - idx} isSelected />
          ))}
        </SlotNavItemGroup>
      </MeasureOffscreen>
    </>
  );
}

interface SlotNavItemGroupProps extends PropsWithChildren {
  slot: number;
  isSelected?: boolean;
}

function SlotNavItemGroup({
  slot,
  isSelected,
  children,
}: SlotNavItemGroupProps) {
  const isBeforeFirstProcessed =
    slot < (useAtomValue(firstProcessedSlotAtom) ?? -1);
  const isAfterLastProcessed =
    slot > (useAtomValue(lastProcessedLeaderAtom) ?? Infinity);
  const isDisabled = isBeforeFirstProcessed || isAfterLastProcessed;

  return (
    <Flex
      className={clsx(styles.slotItemGroup, {
        [styles.disabled]: isDisabled,
        [styles.isSelected]: isSelected,
      })}
    >
      {children}
    </Flex>
  );
}

interface SlotNavItemProps {
  slot: number;
  isSelected: boolean;
  onSelectedSlotRef?: (el: HTMLAnchorElement) => void;
}

function SlotNavItem({
  slot,
  isSelected,
  onSelectedSlotRef,
}: SlotNavItemProps) {
  // TODO: refactor after fixing querying caching mechanism
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const queryPublish = useSlotQueryPublish(slot);
  const isSkipped = useAtomValue(skippedSlotsAtom)?.includes(slot);
  const isBeforeFirstProcessed =
    slot < (useAtomValue(firstProcessedSlotAtom) ?? -1);
  const isAfterLastProcessed =
    slot >=
    (useAtomValue(lastProcessedLeaderAtom) ?? Infinity) + slotsPerLeader;
  const isDisabled = isBeforeFirstProcessed || isAfterLastProcessed;

  return (
    <Link
      to="/slotDetails"
      search={{ slot }}
      key={slot}
      className={clsx(styles.slotItem, {
        [styles.selectedSlot]: isSelected,
        [styles.skippedSlot]: isSkipped,
      })}
      ref={onSelectedSlotRef}
      disabled={isDisabled}
    >
      <Text>{slot}</Text>
      {isSkipped ? (
        <SkippedIcon size="large" />
      ) : (
        <StatusIcon isCurrent={false} slot={slot} size="large" />
      )}
    </Link>
  );
}
