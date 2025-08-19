import { Flex, TextField, Text, IconButton } from "@radix-ui/themes";
import SlotPerformance from "../Overview/SlotPerformance";
import ComputeUnitsCard from "../Overview/SlotPerformance/ComputeUnitsCard";
import TransactionBarsCard from "../Overview/SlotPerformance/TransactionBarsCard";
import { useSlotSearchParam } from "./useSearchParams";
import { useAtomValue, useSetAtom } from "jotai";
import {
  selectedSlotAtom,
  baseSelectedSlotAtom,
} from "../Overview/SlotPerformance/atoms";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useUnmount } from "react-use";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  InfoCircledIcon,
  MagnifyingGlassIcon,
} from "@radix-ui/react-icons";
import { useSlotInfo } from "../../hooks/useSlotInfo";
import styles from "./slotDetails.module.css";
import PeerIcon from "../../components/PeerIcon";
import {
  earliestProcessedSlotLeaderAtom,
  epochAtom,
  mostRecentSlotLeaderAtom,
} from "../../atoms";
import { slotsPerLeader } from "../../consts";
import { useSlotQueryPublish } from "../../hooks/useSlotQuery";
import { getLeaderSlots, getSlotGroupLeader } from "../../utils";
import { StatusIcon } from "../../components/StatusIcon";
import clsx from "clsx";
import { failureColor } from "../../colors";

import skippedIcon from "../../assets/Skipped.svg";
import green_flag from "../../assets/flag.svg";
import checkFill from "../../assets/checkFill.svg";

import { skippedSlotsAtom } from "../../api/atoms";
import { useTimeAgo } from "../../hooks/useTimeAgo";
import SlotClient from "../../components/SlotClient";

export default function SlotDetails() {
  const selectedSlot = useAtomValue(selectedSlotAtom);

  return (
    <Flex direction="column" gap="2" flexGrow="1" flexShrink="1" height="100%">
      <Setup />
      {selectedSlot === undefined ? <SlotSearch /> : <SlotContent />}
    </Flex>
  );
}

function Setup() {
  const { selectedSlot } = useSlotSearchParam();
  const setBaseSelectedSlot = useSetAtom(baseSelectedSlotAtom);

  // To sync atom to search param
  useEffect(() => {
    setBaseSelectedSlot(selectedSlot);
  }, [selectedSlot, setBaseSelectedSlot]);

  useUnmount(() => {
    setBaseSelectedSlot(undefined);
  });

  return null;
}

function Errors() {
  const { slot, isValid } = useAtomValue(baseSelectedSlotAtom);

  const epoch = useAtomValue(epochAtom);

  if (isValid) return;
  return (
    <Text color="red" size="3" style={{ color: failureColor }}>
      Slot {slot} is outside this epoch. Try again with a different ID between{" "}
      {epoch?.start_slot} - {epoch?.end_slot}.
    </Text>
  );
}

function SlotSearch() {
  const { selectedSlot, setSelectedSlot } = useSlotSearchParam();
  const [searchSlot, setSearchSlot] = useState<string>("");
  const epoch = useAtomValue(epochAtom);

  const submitSearch = useCallback(() => {
    if (searchSlot === "") setSelectedSlot(undefined);
    else setSelectedSlot(Number(searchSlot));
  }, [searchSlot, setSelectedSlot]);
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        submitSearch();
      }
    },
    [submitSearch],
  );

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
      p="4"
      className={styles.search}
    >
      <TextField.Root
        placeholder={`Slot ID e.g. ${epoch?.start_slot ?? 0}`}
        type="number"
        step="1"
        value={searchSlot}
        onKeyDown={handleKeyDown}
        onChange={(e) => setSearchSlot(e.target.value)}
        size="3"
      >
        <TextField.Slot side="right">
          <IconButton variant="ghost" color="gray" onClick={submitSearch}>
            <MagnifyingGlassIcon height="16" width="16" />
          </IconButton>
        </TextField.Slot>
      </TextField.Root>
      <Errors />
      <QuickSearch />
    </Flex>
  );
}

function QuickSearch() {
  return (
    <Flex direction="column" gap="4" justify="center" align="center" p="4">
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
      label="Earliest Slot"
      icon={green_flag}
      color="#1D863B"
      disabled={earliestProcessedSlotLeader === undefined}
      slot={earliestProcessedSlotLeader}
    />
  );
}

function MostRecentSlotSearch() {
  const mostRecentSlotLeader = useAtomValue(mostRecentSlotLeaderAtom);

  return (
    <QuickSearchCard
      label="Most Recent Slot"
      icon={checkFill}
      color="#1D863B"
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
      label="Last Skipped Slot"
      icon={skippedIcon}
      color="#EB6262"
      slot={slot}
      disabled={!skippedSlots || skippedSlots?.length === 0}
    />
  );
}

function QuickSearchCard({
  label,
  icon,
  color,
  slot,
  disabled = false,
}: {
  label: string;
  icon: string;
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
      <img width="32px" height="32px" src={icon} />
      <Text size="4" align="left">
        {label}
      </Text>
      <Flex width="100%" justify="between">
        <Text size="1" style={{ color: "#cecece" }}>
          {slot}
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
    <Text size="1" style={{ color: "#646464" }}>
      {timeAgoText}
    </Text>
  );
}

function SlotHeader({ slot }: { slot: number }) {
  const { setSelectedSlot } = useSlotSearchParam();
  const { peer, isLeader, name, pubkey } = useSlotInfo(slot);
  const epoch = useAtomValue(epochAtom);

  const leaderSlotsForValidator = useMemo(
    () => (epoch && pubkey ? getLeaderSlots(epoch, pubkey) : []),
    [epoch, pubkey],
  );
  const slotIndexForValidator = useMemo(() => {
    if (!leaderSlotsForValidator) return;
    return leaderSlotsForValidator.indexOf(slot);
  }, [leaderSlotsForValidator, slot]);

  return (
    <Flex gap="3" wrap="wrap">
      <Flex gap="1" align="center">
        <PeerIcon url={peer?.info?.icon_url} size={22} isYou={isLeader} />
        <Text className={styles.slotName}>{name}</Text>
      </Flex>
      <Flex gap="1" align="center">
        <SlotClient slot={slot} size="16px" />
        <InfoCircledIcon width={16} height={16} />
      </Flex>
      <Flex gap="1" flexGrow="1" flexShrink="1" wrap="wrap">
        {Array.from({ length: slotsPerLeader }).map((_, slotIdx) => {
          const slotNumber = slot + slotIdx;
          return <SlotStatus key={slotNumber} slot={slotNumber} />;
        })}
        <Flex
          gap="2"
          justify="center"
          align="center"
          flexGrow="0"
          flexShrink="0"
          className={styles.slotNavigation}
        >
          <IconButton
            variant="ghost"
            color="gray"
            disabled={
              slotIndexForValidator === undefined ||
              slotIndexForValidator === -1 ||
              slotIndexForValidator === 0
            }
            onClick={() => {
              if (slotIndexForValidator === undefined) return;
              setSelectedSlot(
                leaderSlotsForValidator[slotIndexForValidator - 1],
              );
            }}
          >
            <ChevronLeftIcon />
          </IconButton>
          <PeerIcon
            url={peer?.info?.icon_url}
            size={22}
            isYou={isLeader}
            isRounded
          />
          <IconButton
            variant="ghost"
            color="gray"
            disabled={
              !leaderSlotsForValidator ||
              slotIndexForValidator === -1 ||
              slotIndexForValidator === leaderSlotsForValidator?.length - 1
            }
            onClick={() => {
              if (slotIndexForValidator === undefined) return;
              setSelectedSlot(
                leaderSlotsForValidator[slotIndexForValidator + 1],
              );
            }}
          >
            <ChevronRightIcon />
          </IconButton>
        </Flex>
      </Flex>
    </Flex>
  );
}

function SlotStatus({ slot }: { slot: number }) {
  const { setSelectedSlot } = useSlotSearchParam();
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const queryPublish = useSlotQueryPublish(slot);
  const isSelected = useMemo(() => slot === selectedSlot, [slot, selectedSlot]);

  const isSkipped = useMemo(
    () => queryPublish.publish?.skipped,
    [queryPublish.publish?.skipped],
  );

  return (
    <Flex
      align="center"
      justify="center"
      flexGrow="1"
      flexShrink="1"
      className={clsx(
        styles.slotStatus,
        isSelected && styles.selectedSlot,
        isSkipped && styles.skippedSlot,
      )}
      onClick={() => setSelectedSlot(slot)}
    >
      <Text>{slot}</Text>
      <StatusIcon isCurrent={false} slot={slot} iconSize="15px" />
    </Flex>
  );
}

function SlotContent() {
  const slot = useAtomValue(selectedSlotAtom);
  if (!slot) return;
  const slotGroupLeader = getSlotGroupLeader(slot);

  return (
    <Flex direction="column" gap="2" flexGrow="1" flexShrink="1">
      <SlotHeader slot={slotGroupLeader} />
      <SlotPerformance />
      <ComputeUnitsCard />
      <TransactionBarsCard />
    </Flex>
  );
}
