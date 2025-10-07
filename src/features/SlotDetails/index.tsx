import { Flex, Text } from "@radix-ui/themes";
import SlotPerformance from "../Overview/SlotPerformance";
import ComputeUnitsCard from "../Overview/SlotPerformance/ComputeUnitsCard";
import TransactionBarsCard from "../Overview/SlotPerformance/TransactionBarsCard";
import { useSlotSearchParam } from "./useSearchParams";
import { useAtomValue, useSetAtom } from "jotai";
import {
  selectedSlotAtom,
  baseSelectedSlotAtom,
} from "../Overview/SlotPerformance/atoms";
import { useEffect, useMemo } from "react";
import { useMedia, useUnmount } from "react-use";
import { useSlotInfo } from "../../hooks/useSlotInfo";
import styles from "./slotDetails.module.css";
import PeerIcon from "../../components/PeerIcon";
import {
  firstProcessedLeaderAtom,
  epochAtom,
  lastProcessedLeaderAtom,
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
import SlotClient from "../../components/SlotClient";
import { Link } from "@tanstack/react-router";
import { SlotSearch } from "./SlotSearch";

export default function SlotDetails() {
  const selectedSlot = useAtomValue(selectedSlotAtom);

  return (
    <>
      <Setup />
      {selectedSlot === undefined ? <SlotSearch /> : <SlotContent />}
    </>
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

const navigationTop = clusterIndicatorHeight + headerHeight;

function SlotNavigation({ slot }: { slot: number }) {
  const { pubkey } = useSlotInfo(slot);
  const epoch = useAtomValue(epochAtom);
  const firstProcessedLeader = useAtomValue(firstProcessedLeaderAtom);
  const lastProcessedLeader = useAtomValue(lastProcessedLeaderAtom);

  const {
    previousSlotGroupLeader,
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
      firstProcessedLeader === undefined ||
      previousSlotGroupLastSlot < firstProcessedLeader;

    const nextSlotGroupLeader =
      leaderSlotsForValidator[slotIndexForValidator + 1];
    const isNextDisabled =
      nextSlotGroupLeader === undefined ||
      lastProcessedLeader === undefined ||
      lastProcessedLeader + slotsPerLeader <= nextSlotGroupLeader;

    return {
      previousSlotGroupLeader,
      previousSlotGroupLastSlot,
      isPreviousDisabled,
      nextSlotGroupLeader,
      isNextDisabled,
    };
  }, [firstProcessedLeader, epoch, lastProcessedLeader, pubkey, slot]);

  return (
    <Flex
      gap="3"
      className={clsx("sticky", styles.slotNavigationContainer)}
      pb="1"
      style={{ top: navigationTop, zIndex: maxZIndex - 3 }}
    >
      <PreviousNextNavigation
        slot={previousSlotGroupLastSlot}
        searchSlot={previousSlotGroupLeader}
        isDisabled={isPreviousDisabled}
        isPrevious={true}
      />
      <SelectedSlotGroup firstSlot={slot} />
      <PreviousNextNavigation
        slot={nextSlotGroupLeader}
        searchSlot={nextSlotGroupLeader}
        isDisabled={isNextDisabled}
        isPrevious={false}
      />
    </Flex>
  );
}

function SelectedSlotGroup({ firstSlot }: { firstSlot: number }) {
  return (
    <Flex gap="1" className={styles.slotNavigation}>
      {Array.from({ length: slotsPerLeader }).map((_, slotIdx) => {
        const slotNumber = firstSlot + slotIdx;
        return (
          <SlotStatus
            key={slotNumber}
            slot={slotNumber}
            searchSlot={slotNumber}
          />
        );
      })}
    </Flex>
  );
}
function PreviousNextNavigation({
  slot,
  searchSlot,
  isDisabled,
  isPrevious,
}: {
  slot?: number;
  searchSlot?: number;
  isDisabled?: boolean;
  isPrevious: boolean;
}) {
  return (
    <div
      className={clsx(styles.slotNavigation, {
        [styles.previousNavigation]: isPrevious,
        [styles.nextNavigation]: !isPrevious,
        [styles.disabled]: isDisabled,
      })}
    >
      {slot !== undefined && searchSlot !== undefined && (
        <SlotStatus slot={slot} searchSlot={searchSlot} disabled={isDisabled} />
      )}
    </div>
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
  const includeIcon = !useMedia("(max-width: 920px)");
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
      className={clsx(styles.slotStatus, {
        [styles.selectedSlot]: isSelected,
        [styles.skippedSlot]: isSkipped,
      })}
      disabled={disabled || isSelected}
    >
      <Text className={styles.slotStatusText}>{slot}</Text>
      {includeIcon &&
        (isSkipped ? (
          <SkippedIcon size="large" />
        ) : (
          <StatusIcon isCurrent={false} slot={slot} size="large" />
        ))}
    </Link>
  );
}

function SlotContent() {
  const slot = useAtomValue(selectedSlotAtom);
  if (slot === undefined) return;
  const slotGroupLeader = getSlotGroupLeader(slot);

  return (
    <Flex direction="column" gap="2" flexGrow="1">
      <SlotNavigation slot={slotGroupLeader} />
      <SlotHeader slot={slotGroupLeader} />
      <SlotPerformance />
      <ComputeUnitsCard />
      <TransactionBarsCard />
    </Flex>
  );
}
