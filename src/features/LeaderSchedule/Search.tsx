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
import { atom, useAtomValue, useSetAtom } from "jotai";
import { setSearchLeaderSlotsAtom, searchLeaderSlotsAtom } from "./atoms";
import { useMount } from "react-use";
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
import { useCallback, useEffect, useState } from "react";
import * as Toggle from "@radix-ui/react-toggle";
import { SearchTypeEnum } from "../../routes/leaderSchedule";
import {
  useSearchTextSearchParam,
  useSearchTypeSearchParam,
} from "./useSearchParams";
import { searchIconColor } from "../../colors";

const isVisibleAtom = atom((get) => !!get(currentLeaderSlotAtom));

export default function Search() {
  const isVisible = useAtomValue(isVisibleAtom);
  const setSearch = useSetAtom(setSearchLeaderSlotsAtom);

  const setSlotOverride = useSetAtom(slotOverrideAtom);

  const { searchType } = useSearchTypeSearchParam();
  const { searchText, setSearchText } = useSearchTextSearchParam();
  const [localValue, setLocalValue] = useState(searchText);

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setSearch(value);
    setSearchText(value);
  }, 1_000);

  useEffect(() => {
    if (!debouncedSetSearch.isPending() && localValue !== searchText) {
      setLocalValue(searchText);
    }
  }, [debouncedSetSearch, localValue, searchText]);

  const reset = () => {
    setSearchText("");
    setSlotOverride(undefined);
    setSearch("");
  };

  useMount(() => {
    if (searchType === SearchTypeEnum.text) {
      setSearch(searchText);
    }
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
            setLocalValue(e.currentTarget.value);
            debouncedSetSearch(e.currentTarget.value);
          }}
          value={localValue}
        >
          <TextField.Slot>
            <MagnifyingGlassIcon
              height="16"
              width="16"
              style={{ color: searchIconColor }}
            />
          </TextField.Slot>
          {localValue && (
            <TextField.Slot>
              <IconButton size="1" variant="ghost">
                <Cross1Icon
                  height="14"
                  width="14"
                  style={{ color: searchIconColor }}
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
  const leaderSlots = useAtomValue(leaderSlotsAtom);
  const setSearch = useSetAtom(searchLeaderSlotsAtom);
  const setSlotOverride = useSetAtom(slotOverrideAtom);

  const { searchType, setSearchType } = useSearchTypeSearchParam();

  const slotCount = (leaderSlots?.length ?? 0) * 4;

  const setMySlots = useCallback(() => {
    setSearch(leaderSlots);
  }, [setSearch, leaderSlots]);

  useEffect(() => {
    if (searchType === SearchTypeEnum.mySlots) {
      setSearch(leaderSlots);
    }
    // On mount / data load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderSlots, setSearch]);

  const handleClick = () => {
    resetSearchText();

    setSlotOverride(undefined);

    if (searchType === SearchTypeEnum.mySlots) {
      setSearchType(SearchTypeEnum.text);
    } else {
      setSearchType(SearchTypeEnum.mySlots);
      setMySlots();
    }
  };

  const isSelected = searchType === SearchTypeEnum.mySlots;
  const isDisabled = !leaderSlots?.length;

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

  const { searchType, setSearchType } = useSearchTypeSearchParam();

  const skippedCount = skippedSlots?.length ?? 0;

  const setSkippedSlots = useCallback(() => {
    const slotStarts = skippedSlots?.map((slot) => slot - (slot % 4));
    setSearch([...new Set(slotStarts)]);
  }, [setSearch, skippedSlots]);

  useEffect(() => {
    if (searchType === SearchTypeEnum.skippedSlots) {
      setSkippedSlots();
    }
    // On mount / data load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSkippedSlots]);

  const handleClick = () => {
    resetSearchText();

    setSlotOverride(undefined);

    if (searchType === SearchTypeEnum.skippedSlots) {
      setSearchType(SearchTypeEnum.text);
    } else if (skippedSlots?.length) {
      setSearchType(SearchTypeEnum.skippedSlots);
      setSkippedSlots();
    }
  };

  const isSelected = searchType === SearchTypeEnum.skippedSlots;
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
            disabled={!isSelected && isDisabled}
          >
            <Text className={styles.label}>My Skipped Slots</Text>
            <Text>{skippedCount}</Text>
          </Toggle.Root>
        </Reset>
      </div>
    </Tooltip>
  );
}
