import { Cross1Icon, MagnifyingGlassIcon } from "@radix-ui/react-icons";
import {
  Flex,
  Box,
  TextField,
  Text,
  IconButton,
  Reset,
  Tooltip,
} from "@radix-ui/themes";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  setSearchLeaderSlotsAtom,
  SearchType,
  searchTypeAtom,
  searchLeaderSlotsAtom,
} from "./atoms";
import { useMount, useUnmount } from "react-use";
import {
  currentLeaderSlotAtom,
  leaderSlotsAtom,
  skipRateAtom,
  slotOverrideAtom,
} from "../../atoms";
import { useDebouncedCallback } from "use-debounce";
import NextSlotStatus from "../Overview/SlotPerformance/NextSlotStatus";
import styles from "./search.module.css";
import { skippedSlotsAtom } from "../../api/atoms";
import { useState } from "react";
import * as Toggle from "@radix-ui/react-toggle";

const isVisibleAtom = atom((get) => !!get(currentLeaderSlotAtom));

export default function Search() {
  const isVisible = useAtomValue(isVisibleAtom);
  const setSearch = useSetAtom(setSearchLeaderSlotsAtom);
  const [localSearch, setLocalSearch] = useState("");

  const setSearchType = useSetAtom(searchTypeAtom);
  const setSlotOverride = useSetAtom(slotOverrideAtom);

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setSearch(value);
  }, 1000);

  const reset = () => {
    setLocalSearch("");
    setSlotOverride(undefined);
    setSearch("");
  };

  useMount(reset);
  useUnmount(() => {
    setSearchType(SearchType.Text);
  });

  if (!isVisible) return;

  return (
    <Flex className={styles.container} gap="2" wrap="wrap">
      <Box className={styles.searchBox}>
        <TextField.Root
          placeholder="Name, pubkey, or slot (separate with , or ; for multiple values)"
          variant="soft"
          color="gray"
          onChange={(e) => {
            setSearchType(SearchType.Text);
            setLocalSearch(e.currentTarget.value);
            debouncedSetSearch(e.currentTarget.value);
          }}
          value={localSearch}
        >
          <TextField.Slot>
            <MagnifyingGlassIcon
              height="16"
              width="16"
              style={{ color: "#AFB2C2" }}
            />
          </TextField.Slot>
          {localSearch && (
            <TextField.Slot>
              <IconButton size="1" variant="ghost">
                <Cross1Icon
                  height="14"
                  width="14"
                  style={{ color: "#AFB2C2" }}
                  onClick={reset}
                />
              </IconButton>
            </TextField.Slot>
          )}
        </TextField.Root>
      </Box>

      <MySlots resetSearchText={reset} />
      <SkippedSlots resetSearchText={reset} />
      <SkipRate />
      <Box flexGrow="1" />
      <NextSlotStatus />
    </Flex>
  );
}

function SkipRate() {
  const skipRate = useAtomValue(skipRateAtom);

  let value = "-";

  if (skipRate !== undefined) {
    // if (skipRate.slots_processed)
    //   if (skipRate.slots_processed === 0 || skipRate.slots_skipped === 0) {
    //     value = "0";
    //   } else {
    //     const skipRatePct = skipRate.slots_skipped / skipRate.slots_processed;
    //     value = (skipRatePct * 100).toLocaleString(undefined, {
    //       minimumFractionDigits: 0,
    //       maximumFractionDigits: 2,
    //     });
    //   }
    value = (skipRate.skip_rate * 100).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

    value += "%";
  }

  return (
    <Flex justify="center" align="center" gap="1">
      <Text className={styles.skipRateLabel}>Skip Rate</Text>
      <Text className={skipRate ? styles.skipRateValue : styles.skipRateLabel}>
        {value}
      </Text>
    </Flex>
  );
}

interface MySlotsProps {
  resetSearchText: () => void;
}

function MySlots({ resetSearchText }: MySlotsProps) {
  const slots = useAtomValue(leaderSlotsAtom);
  const setSearch = useSetAtom(searchLeaderSlotsAtom);
  const setSlotOverride = useSetAtom(slotOverrideAtom);

  const [searchType, setSearchType] = useAtom(searchTypeAtom);

  const slotCount = (slots?.length ?? 0) * 4;

  const handleClick = () => {
    resetSearchText();

    setSlotOverride(undefined);

    if (searchType === SearchType.MySlots) {
      setSearchType(SearchType.Text);
    } else {
      setSearchType(SearchType.MySlots);
      setSearch(slots);
    }
  };

  const isSelected = searchType === SearchType.MySlots;
  const isDisabled = !slots?.length;

  return (
    <Tooltip content="Number of slots this validator is leader in the current epoch. Toggle to filter">
      <div>
        <Reset>
          <Toggle.Root
            className={`${styles.mySlots}`}
            onClick={handleClick}
            aria-label="Toggle my slots"
            pressed={isSelected}
            disabled={isDisabled}
          >
            <Text className={styles.label}>My Slots</Text>
            <Text>{slotCount}</Text>
          </Toggle.Root>
        </Reset>
      </div>
    </Tooltip>
  );
}

interface SkippedSlotsProps {
  resetSearchText: () => void;
}

function SkippedSlots({ resetSearchText }: SkippedSlotsProps) {
  const skippedSlots = useAtomValue(skippedSlotsAtom);
  const setSearch = useSetAtom(searchLeaderSlotsAtom);
  const setSlotOverride = useSetAtom(slotOverrideAtom);

  const [searchType, setSearchType] = useAtom(searchTypeAtom);

  const skippedCount = skippedSlots?.length ?? 0;

  const handleClick = () => {
    resetSearchText();

    setSlotOverride(undefined);

    if (searchType === SearchType.SkippedSlots) {
      setSearchType(SearchType.Text);
    } else if (skippedSlots?.length) {
      setSearchType(SearchType.SkippedSlots);

      const slotStarts = skippedSlots?.map((slot) => slot - (slot % 4));
      setSearch([...new Set(slotStarts)]);
    }
  };

  const isSelected = searchType === SearchType.SkippedSlots;
  const isDisabled = !skippedSlots?.length;

  return (
    <Tooltip content="Number of slots this validator has skipped in the current epoch since it was last restarted. Toggle to filter">
      <div>
        <Reset>
          <Toggle.Root
            className={`${styles.skippedSlots} ${isDisabled ? styles.disabled : ""}`}
            onClick={handleClick}
            aria-label="Toggle skipped slots"
            pressed={isSelected}
            disabled={isDisabled}
          >
            <Text className={styles.label}>My Skipped Slots</Text>
            <Text>{skippedCount}</Text>
          </Toggle.Root>
        </Reset>
      </div>
    </Tooltip>
  );
}
