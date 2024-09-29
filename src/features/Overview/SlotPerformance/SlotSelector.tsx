import { Flex, RadioCards, Text, Tooltip } from "@radix-ui/themes";
import { useAtom, useAtomValue } from "jotai";
import {
  leaderSlotsAtom,
  currentSlotAtom,
  isCurrentlyLeaderAtom,
  nextLeaderSlotAtom,
  slotOverrideAtom,
  getIsSkippedAtom,
  epochAtom,
  nextEpochLeaderSlotsAtom,
  nextEpochLeaderSlotAtom,
} from "../../../atoms";
import { useMeasure } from "react-use";
import styles from "./slotSelector.module.css";
import { useEffect, useMemo, useRef, useState } from "react";
import NavigatePrev from "./NavigatePrev";
import NavigateNext from "./NavigateNext";
import { selectedSlotStrAtom } from "./atoms";
import skippedIcon from "../../../assets/Skipped.svg";

function getAllLeaderSlots(leaderSlots?: number[]) {
  return leaderSlots?.reduce<{ slot: number; order: number }[]>((acc, slot) => {
    return acc.concat(
      ...[
        { slot, order: 1 },
        { slot: slot + 1, order: 2 },
        { slot: slot + 2, order: 3 },
        { slot: slot + 3, order: 4 },
      ]
    );
  }, []);
}

function getValidIndex({
  index,
  maxIndex,
}: {
  index?: number;
  maxIndex?: number;
}) {
  index = index ?? maxIndex ?? 0;
  if (maxIndex === undefined) return Math.max(index, 0);
  return Math.max(Math.min(index ?? maxIndex, maxIndex), 0);
}

export default function SlotSelector() {
  const leaderStartSlots = useAtomValue(leaderSlotsAtom);
  const nextEpochLeaderStartSlots = useAtomValue(nextEpochLeaderSlotsAtom);
  const _nextLeaderSlot = useAtomValue(nextLeaderSlotAtom);
  const nextEpochLeaderSlot = useAtomValue(nextEpochLeaderSlotAtom);
  const nextLeaderSlot = _nextLeaderSlot ?? nextEpochLeaderSlot;
  const currentSlot = useAtomValue(currentSlotAtom);
  const isCurrentlyLeader = useAtomValue(isCurrentlyLeaderAtom);
  const [slotOverride, setSlotOverride] = useAtom(slotOverrideAtom);

  const [selectedSlotOverride, setSelectedSlotOverride] =
    useAtom(selectedSlotStrAtom);

  const [indexOverride, setIndexOverride] = useState<number>();

  const [ref, { width }] = useMeasure<HTMLDivElement>();
  const [slotWidth, setSlotWidth] = useState(95);
  const viewableSlotCount = Math.ceil(width / slotWidth);

  const allLeaderSlots = useMemo(
    () => {
      if (!leaderStartSlots) return;

      const slots = [...leaderStartSlots];
      if (nextEpochLeaderStartSlots?.length) {
        slots.push(nextEpochLeaderStartSlots[0]);
      }

      return getAllLeaderSlots(slots);
    }, //, nextLeaderSlot),
    [leaderStartSlots, nextEpochLeaderStartSlots]
  );

  const liveSlot = isCurrentlyLeader ? currentSlot : nextLeaderSlot;
  const { overflowIndex, maxIndex } = useMemo(() => {
    if (!allLeaderSlots?.length)
      return { maxIndex: undefined, overflowIndex: 0 };
    if (!viewableSlotCount) return { maxIndex: undefined, overflowIndex: 0 };

    let maxIndex = allLeaderSlots.length - 1 - viewableSlotCount - 1;
    let overflowIndex = maxIndex;
    if (maxIndex < 0) {
      maxIndex = 0;
    }

    while (
      allLeaderSlots[overflowIndex + viewableSlotCount - 1] !== undefined &&
      allLeaderSlots[overflowIndex + viewableSlotCount - 1].slot >
        (liveSlot ?? 0)
    ) {
      if (maxIndex > 0) {
        maxIndex--;
      }
      overflowIndex--;
    }

    if (overflowIndex > 0) {
      overflowIndex = 0;
    }

    return { maxIndex, overflowIndex };
  }, [allLeaderSlots, liveSlot, viewableSlotCount]);

  // maxIndex will get recalc'd on screen size changes which requires an index change
  if (
    indexOverride !== undefined &&
    maxIndex !== undefined &&
    indexOverride > maxIndex
  ) {
    setIndexOverride(undefined);
  }

  const index =
    (indexOverride === undefined && maxIndex !== undefined
      ? maxIndex
      : indexOverride) ?? 0;

  const isLiveSelectorVisible =
    indexOverride === undefined || index === maxIndex;

  const settingSlotOverrideRef = useRef<NodeJS.Timeout>();
  const setSlotOverrideTimeout = () => {
    if (settingSlotOverrideRef.current) {
      clearTimeout(settingSlotOverrideRef.current);
    }
    settingSlotOverrideRef.current = setTimeout(
      () => (settingSlotOverrideRef.current = undefined),
      250
    );
  };

  // syncs slot selector to epoch slider changes
  useEffect(() => {
    if (!allLeaderSlots) return;
    if (settingSlotOverrideRef.current) return;

    if (slotOverride) {
      const slotDiffs = allLeaderSlots.map(({ slot }) =>
        Math.abs(slot - slotOverride)
      );
      const minDiff = Math.min(...slotDiffs);
      const newIndex = getValidIndex({
        index: slotDiffs.indexOf(minDiff),
        maxIndex,
      });
      if (newIndex === maxIndex) {
        setIndexOverride(undefined);
      } else {
        setIndexOverride(newIndex);
      }
    } else {
      setIndexOverride(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotOverride]);

  const viewableSlots = allLeaderSlots?.slice(
    index,
    index + viewableSlotCount + overflowIndex
  );

  const selected =
    selectedSlotOverride ||
    (isLiveSelectorVisible && viewableSlots?.length
      ? `${viewableSlots?.[viewableSlots.length - 1].slot}`
      : undefined);

  const isPrevDisabled = indexOverride !== undefined && indexOverride <= 0;
  const isNextDisabled = isLiveSelectorVisible;

  return (
    <>
      <Flex align="stretch" gap="1" minHeight="24px">
        <NavigatePrev
          nav={(count: number) => {
            if (isPrevDisabled) return;
            setIndexOverride((prev) => {
              prev = prev ?? index;
              const newIndex = prev - count;
              const newValidIndex = getValidIndex({
                index: newIndex,
                maxIndex,
              });
              setSlotOverrideTimeout();
              setSlotOverride(allLeaderSlots?.[newValidIndex + count]?.slot);
              return newValidIndex;
            });
          }}
          disabled={isPrevDisabled}
        />
        <RadioCards.Root
          ref={ref}
          className={styles.root}
          value={selected}
          onValueChange={(value) => {
            value = value.trim();
            if (
              isLiveSelectorVisible &&
              value === `${viewableSlots?.[viewableSlots.length - 1].slot}`
            ) {
              setSelectedSlotOverride(undefined);
              setIndexOverride(undefined);
              setSlotOverrideTimeout();
              setSlotOverride(undefined);
            } else {
              setSelectedSlotOverride(value);
              setIndexOverride(index);
              setSlotOverrideTimeout();
              setSlotOverride(allLeaderSlots?.[index]?.slot);
            }
          }}
        >
          {viewableSlots?.map(({ slot, order }, i) => (
            <RadioItem
              key={slot}
              slot={slot}
              order={i !== 0 ? order : 0}
              isLive={isLiveSelectorVisible && i === viewableSlots.length - 1}
            />
          ))}
        </RadioCards.Root>
        <NavigateNext
          nav={(count: number) => {
            if (isNextDisabled) return;

            setIndexOverride((prev) => {
              if (prev === undefined) return prev;

              const newIndex = prev + count;
              const newValidIndex = getValidIndex({
                index: newIndex,
                maxIndex,
              });
              setSlotOverrideTimeout();

              if (newValidIndex === maxIndex) {
                setSlotOverride(undefined);
                return undefined;
              }

              setSlotOverride(allLeaderSlots?.[newValidIndex + count]?.slot);
              return newValidIndex;
            });
          }}
          disabled={isNextDisabled}
        />
      </Flex>
      <SetSlotWidth setSlotWidth={setSlotWidth} />
    </>
  );
}

interface RadioItemProps {
  slot: number;
  order: number;
  isLive?: boolean;
}

function RadioItem({ slot, order, isLive }: RadioItemProps) {
  const isSkipped =
    useAtomValue(useMemo(() => getIsSkippedAtom(slot), [slot])) && !isLive;

  return (
    <>
      {order === 1 && <div className={styles.divider} />}
      <RadioCards.Item
        value={`${slot}`}
        className={`${styles.item} ${isLive ? styles.live : ""} ${isSkipped ? styles.skipped : ""}`}
      >
        <Flex justify="between">
          <Text className={styles.slotText}>{isLive ? "next" : slot}</Text>
          {/* <Text className={styles.slotText}>{slot}</Text> */}
          {isLive && <div className={styles.liveIcon}>⬤</div>}
          {isSkipped && (
            <Tooltip content="Slot was skipped">
              <img
                src={skippedIcon}
                alt="skipped"
                className={styles.skippedIcon}
              />
            </Tooltip>
          )}
        </Flex>
      </RadioCards.Item>
    </>
  );
}

interface SetSlotWidthProps {
  setSlotWidth: (width: number) => void;
}

function SetSlotWidth({ setSlotWidth }: SetSlotWidthProps) {
  const epoch = useAtomValue(epochAtom);
  const slot = epoch?.end_slot ?? 1_000_000;

  const [ref, { width }] = useMeasure<HTMLDivElement>();

  useEffect(() => {
    setSlotWidth(Math.max(Math.trunc(width + 12), 30));
  }, [setSlotWidth, width]);

  return (
    <div style={{ position: "absolute", opacity: 0, zIndex: -10 }} ref={ref}>
      <RadioCards.Root className={styles.root} value={slot.toString()}>
        <RadioItem slot={slot} order={1} />
      </RadioCards.Root>
    </div>
  );
}
