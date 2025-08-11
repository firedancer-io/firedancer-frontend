import { Flex, TextField, Text, IconButton } from "@radix-ui/themes";
import SlotPerformance from "../Overview/SlotPerformance";
import ComputeUnitsCard from "../Overview/SlotPerformance/ComputeUnitsCard";
import TransactionBarsCard from "../Overview/SlotPerformance/TransactionBarsCard";
import { useSlotSearchParam } from "./useSearchParams";
import { useAtomValue, useSetAtom } from "jotai";
import { selectedSlotAtom } from "../Overview/SlotPerformance/atoms";
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
import { SlotClient } from "../../components/SlotClient";
import { epochAtom } from "../../atoms";
import { slotsPerLeader } from "../../consts";
import { useSlotQueryPublish } from "../../hooks/useSlotQuery";
import { getLeaderSlots, getSlotGroupLeader } from "../../utils";
import { StatusIcon } from "../../components/StatusIcon";
import clsx from "clsx";

export default function SlotDetails() {
  return (
    <Flex direction="column" gap="2" flexGrow="1" flexShrink="1">
      <Setup />
      <SlotSearch />
      <SlotContent />
    </Flex>
  );
}

function Setup() {
  const { selectedSlot } = useSlotSearchParam();
  const epoch = useAtomValue(epochAtom);
  const setSelectedSlotAtom = useSetAtom(selectedSlotAtom);

  // To sync atom to search param
  useEffect(() => {
    setSelectedSlotAtom(selectedSlot);
  }, [epoch, selectedSlot, setSelectedSlotAtom]);

  useUnmount(() => {
    setSelectedSlotAtom(undefined);
  });

  return null;
}

function InvalidSlotState() {
  return (
    <Text>
      Selected slot is outside of the current epoch. Please click on a slot in
      the vertical navigation or enter a valid slot above.
    </Text>
  );
}

function SlotSearch() {
  const { selectedSlot, setSelectedSlot } = useSlotSearchParam();
  const [searchSlot, setSearchSlot] = useState<string>("");
  const epoch = useAtomValue(epochAtom);
  const selectedSlotFromAtom = useAtomValue(selectedSlotAtom);

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
    <>
      <TextField.Root
        placeholder={`Slot ID e.g. ${epoch?.start_slot ?? 123456789}`}
        type="number"
        step="1"
        value={searchSlot}
        onKeyDown={handleKeyDown}
        onChange={(e) => setSearchSlot(e.target.value)}
      >
        <TextField.Slot side="right">
          <IconButton variant="ghost" color="gray" onClick={submitSearch}>
            <MagnifyingGlassIcon height="16" width="16" />
          </IconButton>
        </TextField.Slot>
      </TextField.Root>
      {selectedSlot && !selectedSlotFromAtom && <InvalidSlotState />}
    </>
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
            style={{ borderRadius: "5px" }}
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
    <>
      <SlotHeader slot={slotGroupLeader} />
      <SlotPerformance />
      <ComputeUnitsCard />
      <TransactionBarsCard />
    </>
  );
}
