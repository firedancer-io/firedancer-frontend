import { useCallback, useMemo, useState, type CSSProperties } from "react";
import {
  epochAtom,
  firstProcessedLeaderIndexAtom,
  leaderSlotsAtom,
  nextLeaderSlotIndexAtom,
} from "../../atoms";
import { useAtomValue } from "jotai";
import {
  baseSelectedSlotAtoms,
  SelectedSlotValidityState,
} from "../Overview/SlotPerformance/atoms";
import { Label } from "radix-ui";
import { Flex, IconButton, TextField, Text, Grid } from "@radix-ui/themes";

import styles from "./slotSearch.module.css";
import {
  CounterClockwiseClockIcon,
  DoubleArrowUpIcon,
  MagnifyingGlassIcon,
  PlusCircledIcon,
  TextAlignTopIcon,
  TimerIcon,
} from "@radix-ui/react-icons";
import Skipped from "../../assets/Skipped.svg?react";
import { getSolString } from "../../utils";
import useSlotRankings from "../../hooks/useSlotRankings";
import { slotRankingsAtom } from "../../api/atoms";
import {
  slotDetailsEarliestSlotColor,
  slotDetailsFeesSlotColor,
  slotDetailsRecentSlotColor,
  slotDetailsRewardsSlotColor,
  slotDetailsSkippedSlotColor,
  slotDetailsTipsSlotColor,
} from "../../colors";
import clsx from "clsx";
import { useTimeAgo } from "../../hooks/useTimeAgo";
import { useNavigateToSlot } from "./useNavigateToSlot";

const numQuickSearchCardsPerRow = 3;
const quickSearchCardWidth = 226;
const slotSearchGap = 40;
const slotSearchPadding = 20;
const slotSearchMaxWidth =
  2 * slotSearchPadding +
  numQuickSearchCardsPerRow * quickSearchCardWidth +
  (numQuickSearchCardsPerRow - 1) * slotSearchGap;

export function SlotSearch() {
  const baseSelectedSlot = useAtomValue(baseSelectedSlotAtoms.slot);
  const navigateToSlot = useNavigateToSlot();
  const [searchSlot, setSearchSlot] = useState(
    baseSelectedSlot === undefined ? "" : String(baseSelectedSlot),
  );
  const epoch = useAtomValue(epochAtom);
  const isValid = useAtomValue(baseSelectedSlotAtoms.isValid);

  const submitSearch = useCallback(() => {
    navigateToSlot(searchSlot === "" ? undefined : Number(searchSlot));
  }, [searchSlot, navigateToSlot]);

  return (
    <Grid
      height="100%"
      maxWidth={`${slotSearchMaxWidth}px`}
      justify="center"
      m="auto"
      gap={`${slotSearchGap}px`}
      p={`${slotSearchPadding}px`}
      columns={`repeat(auto-fit, ${quickSearchCardWidth}px)`}
      className={styles.searchGrid}
    >
      <Flex direction="column" gap="8px" gridColumn="1 / -1" asChild>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch();
          }}
        >
          <Label.Root htmlFor="searchSlotId" className={styles.searchLabel}>
            Search Slot ID
          </Label.Root>
          <TextField.Root
            id="searchSlotId"
            className={styles.searchField}
            placeholder={`e.g. ${epoch?.start_slot ?? 0}`}
            type="number"
            step="1"
            value={searchSlot}
            onChange={(e) => setSearchSlot(e.target.value)}
            size="3"
            color={isValid ? "teal" : "red"}
            autoFocus
          >
            <TextField.Slot side="right">
              <IconButton variant="ghost" color="gray" onClick={submitSearch}>
                <MagnifyingGlassIcon height="16" width="16" />
              </IconButton>
            </TextField.Slot>
          </TextField.Root>
          {!isValid && <Errors />}
        </form>
      </Flex>
      <QuickSearch />
    </Grid>
  );
}

function getSolStringWithFourDecimals(lamportAmount: bigint) {
  return `${getSolString(lamportAmount, 4)} SOL`;
}

function QuickSearch() {
  useSlotRankings(true);
  const slotRankings = useAtomValue(slotRankingsAtom);
  const leaderSlots = useAtomValue(leaderSlotsAtom);
  const firstProcessedLeaderIndex = useAtomValue(firstProcessedLeaderIndexAtom);
  const nextLeaderIndex = useAtomValue(nextLeaderSlotIndexAtom);
  const { earliestQuickSlots, mostRecentQuickSlots } = useMemo(() => {
    if (leaderSlots === undefined || firstProcessedLeaderIndex === undefined)
      return {};

    const pastProcessedSlots = leaderSlots.slice(
      firstProcessedLeaderIndex,
      nextLeaderIndex,
    );
    return {
      earliestQuickSlots: pastProcessedSlots,
      mostRecentQuickSlots: pastProcessedSlots.toReversed(),
    };
  }, [firstProcessedLeaderIndex, leaderSlots, nextLeaderIndex]);

  return (
    <>
      <QuickSearchCard
        icon={<CounterClockwiseClockIcon />}
        label="Earliest Slots"
        color={slotDetailsEarliestSlotColor}
        slots={earliestQuickSlots}
      />
      <QuickSearchCard
        icon={<TimerIcon />}
        label="Most Recent Slots"
        color={slotDetailsRecentSlotColor}
        slots={mostRecentQuickSlots}
      />
      <QuickSearchCard
        icon={<Skipped />}
        label="Last Skipped Slots"
        color={slotDetailsSkippedSlotColor}
        slots={slotRankings?.slots_largest_skipped}
      />
      <QuickSearchCard
        icon={<DoubleArrowUpIcon />}
        label="Highest Fees"
        color={slotDetailsFeesSlotColor}
        slots={slotRankings?.slots_largest_fees}
        metricOptions={{
          metrics: slotRankings?.vals_largest_fees,
          metricsFmt: getSolStringWithFourDecimals,
        }}
      />
      <QuickSearchCard
        icon={<PlusCircledIcon />}
        label="Highest Tips"
        color={slotDetailsTipsSlotColor}
        slots={slotRankings?.slots_largest_tips}
        metricOptions={{
          metrics: slotRankings?.vals_largest_tips,
          metricsFmt: getSolStringWithFourDecimals,
        }}
      />
      <QuickSearchCard
        icon={<TextAlignTopIcon />}
        label="Highest Rewards"
        color={slotDetailsRewardsSlotColor}
        slots={slotRankings?.slots_largest_rewards}
        metricOptions={{
          metrics: slotRankings?.vals_largest_rewards,
          metricsFmt: getSolStringWithFourDecimals,
        }}
      />
    </>
  );
}

interface MetricOptions<T extends number | bigint> {
  metrics?: T[];
  metricsFmt?: (m: T) => string | undefined;
}
interface QuickSearchCardProps<T extends number | bigint> {
  icon: React.ReactNode;
  label: string;
  color: string;
  slots?: number[];
  metricOptions?: MetricOptions<T>;
}

function QuickSearchCard<T extends number | bigint>({
  icon,
  label,
  color,
  slots,
  metricOptions,
}: QuickSearchCardProps<T>) {
  return (
    <Flex
      direction="column"
      className={styles.quickSearchCard}
      p="20px"
      gap="20px"
    >
      <Flex
        direction="column"
        gap="10px"
        className={styles.quickSearchHeader}
        style={{ "--quick-search-color": color } as CSSProperties}
      >
        {icon}
        <Text align="left">{label}</Text>
      </Flex>
      <QuickSearchSlots slots={slots} metricOptions={metricOptions} />
    </Flex>
  );
}

const numQuickSearchSlots = 3;

function QuickSearchSlots<T extends number | bigint>({
  slots,
  metricOptions,
}: {
  slots?: number[];
  metricOptions?: MetricOptions<T>;
}) {
  const navigateToSlot = useNavigateToSlot();

  return (
    <Flex direction="column" gap="5px">
      {Array.from({ length: numQuickSearchSlots }).map((_, i) => {
        const slot = slots?.[i];
        return (
          <Flex key={i} justify="between">
            {slot === undefined ? (
              <Text className={styles.quickSearchSlot}>--</Text>
            ) : (
              <Text
                className={clsx(styles.quickSearchSlot, styles.clickable)}
                onClick={() => navigateToSlot(slot)}
              >
                {slot}
              </Text>
            )}
            <Text className={styles.quickSearchMetric}>
              <QuickSearchMetric
                slot={slot}
                metric={metricOptions?.metrics?.[i]}
                metricsFmt={metricOptions?.metricsFmt}
              />
            </Text>
          </Flex>
        );
      })}
    </Flex>
  );
}

function QuickSearchMetric<T extends number | bigint>({
  slot,
  metric,
  metricsFmt,
}: {
  slot?: number;
  metric?: T;
  metricsFmt?: MetricOptions<T>["metricsFmt"];
}) {
  if (slot === undefined) return "--";
  if (!metricsFmt) return <TimeAgo slot={slot} />;
  if (metric === undefined) return "--";
  return metricsFmt(metric) ?? "--";
}

function TimeAgo({ slot }: { slot: number }) {
  const { timeAgoText } = useTimeAgo(slot, {
    showOnlyTwoSignificantUnits: true,
  });

  return timeAgoText;
}

function Errors() {
  const slot = useAtomValue(baseSelectedSlotAtoms.slot);
  const state = useAtomValue(baseSelectedSlotAtoms.state);

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
