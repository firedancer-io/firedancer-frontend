import { Flex, TextField, Text, IconButton } from "@radix-ui/themes";
import SlotPerformance from "../Overview/SlotPerformance";
import ComputeUnitsCard from "../Overview/SlotPerformance/ComputeUnitsCard";
import TransactionBarsCard from "../Overview/SlotPerformance/TransactionBarsCard";
import { useSlotSearchParam } from "./useSearchParams";
import { useAtomValue, useSetAtom } from "jotai";
import {
  selectedSlotAtom,
  baseSelectedSlotAtom,
  SelectedSlotValidityState,
} from "../Overview/SlotPerformance/atoms";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useUnmount } from "react-use";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { useSlotInfo } from "../../hooks/useSlotInfo";
import styles from "./slotDetails.module.css";
import PeerIcon from "../../components/PeerIcon";
import {
  earliestProcessedSlotLeaderAtom,
  epochAtom,
  mostRecentSlotLeaderAtom,
} from "../../atoms";
import {
  clusterIndicatorHeight,
  headerHeight,
  maxZIndex,
  slotsPerLeader,
} from "../../consts";
import { useSlotQueryPublish } from "../../hooks/useSlotQuery";
import { getLeaderSlots, getSlotGroupLeader } from "../../utils";
import { SkippedIcon, StatusIcon } from "../../components/StatusIcon";
import clsx from "clsx";
import {
  slotDetailsEarliestSlotColor,
  slotDetailsLastSkippedSlotColor,
  slotDetailsMostRecentSlotColor,
  slotDetailsQuickSearchTextPrimaryColor,
  slotDetailsQuickSearchTextSecondaryColor,
} from "../../colors";

import skippedIcon from "../../assets/Skipped.svg?react";
import history from "../../assets/history.svg?react";
import checkFill from "../../assets/checkFill.svg?react";

import { skippedSlotsAtom } from "../../api/atoms";
import { useTimeAgo } from "../../hooks/useTimeAgo";
import SlotClient from "../../components/SlotClient";
import { Link } from "@tanstack/react-router";

export default function SlotDetails() {
  const selectedSlot = useAtomValue(selectedSlotAtom);

  return (
    <Flex direction="column" flexGrow="1" flexShrink="1" height="100%">
      <Setup />
      {selectedSlot === undefined ? <SlotSearch /> : <SlotContent />}
    </Flex>
  );
}

function Setup() {
  const { selectedSlot } = useSlotSearchParam();
  const epoch = useAtomValue(epochAtom);
  const setBaseSelectedSlot = useSetAtom(baseSelectedSlotAtom);

  // To sync atom to search param
  useEffect(() => {
    setBaseSelectedSlot(selectedSlot, epoch);
  }, [selectedSlot, setBaseSelectedSlot, epoch]);

  useUnmount(() => {
    setBaseSelectedSlot(undefined);
  });

  return null;
}

function Errors() {
  const { slot, state } = useAtomValue(baseSelectedSlotAtom);

  const epoch = useAtomValue(epochAtom);
  const message = useMemo(() => {
    switch (state) {
      case SelectedSlotValidityState.NotReady:
        return `Slot ${slot} validity cannot be determined because epoch and leader slot data is not available yet.`;
      case SelectedSlotValidityState.OutsideEpoch:
        return `Slot ${slot} is outside this epoch. Please try again with a different ID between ${epoch?.start_slot} - ${epoch?.end_slot}.`;
      case SelectedSlotValidityState.NotYou:
        return `Slot ${slot} belongs to another validator. Please try again with a slot number processed by you.`;
      case SelectedSlotValidityState.BeforeFirstProcessed:
        return `Slot ${slot} is in this epoch but its details are unavailable because it was processed before the restart.`;
      case SelectedSlotValidityState.Future:
        return `Slot ${slot} is valid but in the future. To view details, check again after it has been processed.`;
      case SelectedSlotValidityState.Valid:
        return "";
    }
  }, [epoch?.end_slot, epoch?.start_slot, slot, state]);

  return (
    <Text size="3" className={styles.errorText}>
      {message}
    </Text>
  );
}

function SlotSearch() {
  const { selectedSlot, setSelectedSlot } = useSlotSearchParam();
  const [searchSlot, setSearchSlot] = useState<string>("");
  const epoch = useAtomValue(epochAtom);
  const { isValid } = useAtomValue(baseSelectedSlotAtom);

  const submitSearch = useCallback(() => {
    if (searchSlot === "") setSelectedSlot(undefined);
    else setSelectedSlot(Number(searchSlot));
  }, [searchSlot, setSelectedSlot]);

  useEffect(() => {
    if (selectedSlot === undefined) setSearchSlot("");
    else setSearchSlot(String(selectedSlot));
  }, [selectedSlot]);

  return (
    <Flex
      direction="column"
      gap="4"
      flexGrow="1"
      flexShrink="1"
      height="100%"
      justify="center"
      align="center"
      p="4"
      className={styles.search}
    >
      <form
        style={{ width: "100%", maxWidth: "510px" }}
        onSubmit={(e) => {
          e.preventDefault();
          submitSearch();
        }}
      >
        <TextField.Root
          placeholder={`Slot ID e.g. ${epoch?.start_slot ?? 0}`}
          type="number"
          step="1"
          value={searchSlot}
          onChange={(e) => setSearchSlot(e.target.value)}
          size="3"
          color={isValid ? "teal" : "red"}
        >
          <TextField.Slot side="right">
            <IconButton variant="ghost" color="gray" onClick={submitSearch}>
              <MagnifyingGlassIcon height="16" width="16" />
            </IconButton>
          </TextField.Slot>
        </TextField.Root>
      </form>
      {!isValid && <Errors />}
      <QuickSearch />
    </Flex>
  );
}

function QuickSearch() {
  return (
    <Flex direction="column" gap="4" justify="center" align="center">
      <Flex className={styles.quickSearchRow}>
        <EarliestProcessedSlotSearch />
        <MostRecentSlotSearch />
        <LastSkippedSlotSearch />
      </Flex>
    </Flex>
  );
}

function EarliestProcessedSlotSearch() {
  const earliestProcessedSlotLeader = useAtomValue(
    earliestProcessedSlotLeaderAtom,
  );
  return (
    <QuickSearchCard
      Icon={history}
      label="Earliest Slot"
      color={slotDetailsEarliestSlotColor}
      disabled={earliestProcessedSlotLeader === undefined}
      slot={earliestProcessedSlotLeader}
    />
  );
}

function MostRecentSlotSearch() {
  const mostRecentSlotLeader = useAtomValue(mostRecentSlotLeaderAtom);

  return (
    <QuickSearchCard
      Icon={checkFill}
      label="Most Recent Slot"
      color={slotDetailsMostRecentSlotColor}
      disabled={mostRecentSlotLeader === undefined}
      slot={mostRecentSlotLeader}
    />
  );
}

function LastSkippedSlotSearch() {
  const skippedSlots = useAtomValue(skippedSlotsAtom);
  const slot = useMemo(
    () => (skippedSlots ? skippedSlots[skippedSlots?.length - 1] : undefined),
    [skippedSlots],
  );

  return (
    <QuickSearchCard
      Icon={skippedIcon}
      label="Last Skipped Slot"
      color={slotDetailsLastSkippedSlotColor}
      slot={slot}
      disabled={!skippedSlots || skippedSlots?.length === 0}
    />
  );
}

function QuickSearchCard({
  Icon,
  label,
  color,
  slot,
  disabled = false,
}: {
  Icon: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
  label: string;
  color: string;
  slot?: number;
  disabled?: boolean;
}) {
  const { setSelectedSlot } = useSlotSearchParam();

  return (
    <Flex
      className={clsx(styles.quickSearch, !disabled && styles.clickable)}
      style={{ color }}
      onClick={() => setSelectedSlot(slot)}
      aria-disabled={disabled}
    >
      <Icon fill={color} width="32px" height="32px" />
      <Text size="4" align="left">
        {label}
      </Text>
      <Flex width="100%" justify="between">
        <Text
          size="1"
          style={{ color: slotDetailsQuickSearchTextPrimaryColor }}
        >
          {slot ?? "--"}
        </Text>
        {slot && <TimeAgo slot={slot} />}
      </Flex>
    </Flex>
  );
}

function TimeAgo({ slot }: { slot: number }) {
  const { timeAgoText } = useTimeAgo(slot, {
    showOnlyLargestUnit: true,
    showSeconds: true,
  });

  return (
    <Text size="1" style={{ color: slotDetailsQuickSearchTextSecondaryColor }}>
      {timeAgoText}
    </Text>
  );
}

const navigationTop = clusterIndicatorHeight + headerHeight;

function SlotNavigation({ slot }: { slot: number }) {
  const { pubkey } = useSlotInfo(slot);
  const epoch = useAtomValue(epochAtom);
  const earliestProcessedSlotLeader = useAtomValue(
    earliestProcessedSlotLeaderAtom,
  );
  const mostRecentSlotLeader = useAtomValue(mostRecentSlotLeaderAtom);

  const {
    previousSlotGroupLastSlot,
    isPreviousDisabled,
    nextSlotGroupLeader,
    isNextDisabled,
  } = useMemo(() => {
    const leaderSlotsForValidator =
      epoch && pubkey ? getLeaderSlots(epoch, pubkey) : [];
    const slotIndexForValidator = leaderSlotsForValidator
      ? leaderSlotsForValidator.indexOf(slot)
      : undefined;
    if (slotIndexForValidator === undefined) return {};

    const previousSlotGroupLeader =
      leaderSlotsForValidator[slotIndexForValidator - 1];
    const previousSlotGroupLastSlot = previousSlotGroupLeader
      ? previousSlotGroupLeader + (slotsPerLeader - 1)
      : undefined;
    const isPreviousDisabled =
      previousSlotGroupLastSlot === undefined ||
      earliestProcessedSlotLeader === undefined ||
      previousSlotGroupLastSlot < earliestProcessedSlotLeader;

    const nextSlotGroupLeader =
      leaderSlotsForValidator[slotIndexForValidator + 1];
    const isNextDisabled =
      nextSlotGroupLeader === undefined ||
      mostRecentSlotLeader === undefined ||
      mostRecentSlotLeader + slotsPerLeader <= nextSlotGroupLeader;

    return {
      previousSlotGroupLastSlot,
      isPreviousDisabled,
      nextSlotGroupLeader,
      isNextDisabled,
    };
  }, [earliestProcessedSlotLeader, epoch, mostRecentSlotLeader, pubkey, slot]);

  return (
    <Flex
      gap="3"
      className={clsx("sticky", styles.slotNavigationContainer)}
      pb="1"
      style={{ top: navigationTop, zIndex: maxZIndex - 3 }}
    >
      <Flex
        className={clsx(
          styles.slotNavigation,
          styles.previousNavigation,
          isPreviousDisabled && styles.disabled,
        )}
      >
        {previousSlotGroupLastSlot && (
          <SlotStatus
            slot={previousSlotGroupLastSlot}
            searchSlot={previousSlotGroupLastSlot}
            disabled={isPreviousDisabled}
          />
        )}
      </Flex>
      <Flex
        gap="1"
        flexGrow="1"
        flexShrink="1"
        wrap="wrap"
        className={styles.slotNavigation}
      >
        {Array.from({ length: slotsPerLeader }).map((_, slotIdx) => {
          const slotNumber = slot + slotIdx;
          return (
            <SlotStatus
              key={slotNumber}
              slot={slotNumber}
              searchSlot={slotNumber}
            />
          );
        })}
      </Flex>
      <Flex
        className={clsx(
          styles.slotNavigation,
          styles.nextNavigation,
          isNextDisabled && styles.disabled,
        )}
      >
        {nextSlotGroupLeader && (
          <SlotStatus
            slot={nextSlotGroupLeader}
            searchSlot={nextSlotGroupLeader}
            disabled={isNextDisabled}
          />
        )}
      </Flex>
    </Flex>
  );
}

function SlotHeader({ slot }: { slot: number }) {
  const { peer, isLeader, name } = useSlotInfo(slot);

  return (
    <Flex
      gap="3"
      wrap="wrap"
      className={styles.header}
      align="center"
      justify="start"
    >
      <PeerIcon url={peer?.info?.icon_url} size={22} isYou={isLeader} />
      <Text className={styles.slotName}>{name}</Text>
      <Flex gap="1">
        <SlotClient slot={slot} size="large" />
      </Flex>
    </Flex>
  );
}

function SlotStatus({
  slot,
  searchSlot,
  disabled = false,
}: {
  slot: number;
  searchSlot: number;
  disabled?: boolean;
}) {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const queryPublish = useSlotQueryPublish(slot);
  const isSelected = useMemo(() => slot === selectedSlot, [slot, selectedSlot]);

  const isSkipped = useMemo(
    () => queryPublish.publish?.skipped,
    [queryPublish.publish?.skipped],
  );

  return (
    <Link
      to="/slotDetails"
      search={{ slot: searchSlot }}
      className={styles.link}
      disabled={disabled || isSelected}
    >
      <Flex
        align="center"
        justify="center"
        className={clsx(
          styles.slotStatus,
          isSelected && styles.selectedSlot,
          isSkipped && styles.skippedSlot,
        )}
      >
        {slot !== undefined && (
          <Text style={disabled ? { cursor: "default" } : undefined}>
            {slot}
          </Text>
        )}
        {queryPublish.publish?.skipped ? (
          <SkippedIcon size="large" />
        ) : (
          <StatusIcon isCurrent={false} slot={slot} size="large" />
        )}
      </Flex>
    </Link>
  );
}

function SlotContent() {
  const slot = useAtomValue(selectedSlotAtom);
  if (slot === undefined) return;
  const slotGroupLeader = getSlotGroupLeader(slot);

  return (
    <Flex direction="column" gap="2" flexGrow="1" flexShrink="1">
      <SlotNavigation slot={slotGroupLeader} />
      <SlotHeader slot={slotGroupLeader} />
      <SlotPerformance />
      <ComputeUnitsCard />
      <TransactionBarsCard />
    </Flex>
  );
}
