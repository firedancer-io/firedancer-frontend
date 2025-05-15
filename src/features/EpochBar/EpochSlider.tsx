import * as Slider from "@radix-ui/react-slider";
import styles from "./epochSlider.module.css";
import React, {
  memo,
  startTransition,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { Box } from "@radix-ui/themes";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { skippedSlotsAtom } from "../../api/atoms";
import warning from "../../assets/warning_16dp_FF5353_FILL1_wght400_GRAD0_opsz20.svg";
import green_flag from "../../assets/flag.svg";
import {
  currentLeaderSlotAtom,
  slotOverrideAtom,
  leaderSlotsAtom,
  epochAtom,
  firstProcessedSlotAtom,
} from "../../atoms";
import { useInterval, useMeasure } from "react-use";
import { Epoch } from "../../api/types";
import clsx from "clsx";

// 1 tick about 10 leaders or 40 slots
const sliderMaxValue = 10_800;

function slotToEpochPct({
  slot,
  epochStartSlot,
  epochEndSlot,
}: {
  slot?: number;
  epochStartSlot?: number;
  epochEndSlot?: number;
}) {
  if (
    !slot ||
    epochStartSlot === undefined ||
    epochEndSlot === undefined ||
    epochStartSlot === epochEndSlot
  )
    return 0;

  slot = Math.min(Math.max(slot, epochStartSlot), epochEndSlot);
  const totalEpochSlots = epochEndSlot - epochStartSlot;
  const epochSlotProgress = slot - epochStartSlot;
  return epochSlotProgress / totalEpochSlots;
}

function pctToValue(pct: number) {
  return Math.trunc(pct * sliderMaxValue);
}

function valueToSlot(
  value?: number,
  epochStartSlot?: number,
  epochEndSlot?: number,
) {
  if (
    value === undefined ||
    epochStartSlot === undefined ||
    epochEndSlot === undefined
  )
    return;

  const pct = value / sliderMaxValue;
  const totalEpochSlots = epochEndSlot - epochStartSlot;
  return Math.trunc(totalEpochSlots * pct) + epochStartSlot;
}

function epochProgressPctReducer(
  _: number,
  params: { slot?: number; epochStartSlot?: number; epochEndSlot?: number },
): number {
  return slotToEpochPct(params);
}

function getRefreshInterval(epoch: Epoch | undefined, pct: number) {
  if (!epoch || !pct) return 3_000;

  const epochSlots = epoch.end_slot - epoch.start_slot;
  if (epochSlots < 10_000) return 300;
  if (epochSlots < 50_000) return 1_000;
  if (epochSlots < 100_000) return 3_000;
  if (epochSlots < 200_000) return 5_000;
  if (epochSlots < 300_000) return 10_000;
  if (epochSlots < 400_000) return 15_000;
  return 30_000;
}

function removeNearbyPct(
  pcts: { pct: number; slot: number }[],
  pctBound: number,
) {
  if (!pcts.length) return pcts;

  return pcts.reduce(
    (acc, cur, i) => {
      if (i === 0) return acc;

      const prev = acc[acc.length - 1];
      if (Math.abs(cur.pct - prev.pct) < pctBound) {
        return acc;
      }

      acc.push(cur);
      return acc;
    },
    [pcts[0]],
  );
}

interface EpochSliderProps {
  canChange: boolean;
}

export default memo(EpochSlider);

function EpochSlider({ canChange }: EpochSliderProps) {
  const epoch = useAtomValue(epochAtom);
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);
  const [slotOverride, setSlotOverride] = useAtom(slotOverrideAtom);
  const leaderSlots = useAtomValue(leaderSlotsAtom);
  const skippedSlots = useAtomValue(skippedSlotsAtom);
  const firstProcessedSlot = useAtomValue(firstProcessedSlotAtom);
  const [value, setValue] = useState(() => {
    return [
      pctToValue(
        slotToEpochPct({
          slot: currentLeaderSlot,
          epochStartSlot: epoch?.start_slot,
          epochEndSlot: epoch?.end_slot,
        }),
      ),
    ];
  });
  const isChangingValueRef = useRef(false);
  const [measureRef, { width }] = useMeasure<HTMLFormElement>();
  const leaderSlotWidth = Math.trunc(width / 300);

  const [epochProgressPct, updateEpochProgressPct] = useReducer(
    epochProgressPctReducer,
    {
      slot: currentLeaderSlot,
      epochStartSlot: epoch?.start_slot,
      epochEndSlot: epoch?.end_slot,
    },
    slotToEpochPct,
  );

  useInterval(
    () => {
      startTransition(() => {
        updateEpochProgressPct({
          slot: currentLeaderSlot,
          epochStartSlot: epoch?.start_slot,
          epochEndSlot: epoch?.end_slot,
        });
      });
    },
    getRefreshInterval(epoch, epochProgressPct),
  );

  const leaderSlotPcts = useMemo(() => {
    if (!epoch || !leaderSlots?.length) return;

    const pcts = leaderSlots.map((slot) => ({
      slot,
      pct: slotToEpochPct({
        slot,
        epochStartSlot: epoch.start_slot,
        epochEndSlot: epoch.end_slot,
      }),
    }));

    return removeNearbyPct(pcts, 0.003);
  }, [epoch, leaderSlots]);

  const skippedSlotPcts = useMemo(() => {
    if (!epoch || !skippedSlots?.length) return;

    const pcts = skippedSlots.map((slot) => ({
      slot,
      pct: slotToEpochPct({
        slot,
        epochStartSlot: epoch.start_slot,
        epochEndSlot: epoch.end_slot,
      }),
    }));

    return removeNearbyPct(pcts, 0.003);
  }, [epoch, skippedSlots]);

  const firstProcessedSlotPct = useMemo(() => {
    if (!firstProcessedSlot || !epoch) return;
    return slotToEpochPct({
      slot: firstProcessedSlot,
      epochStartSlot: epoch.start_slot,
      epochEndSlot: epoch.end_slot,
    });
  }, [epoch, firstProcessedSlot]);

  // Sync the slider position with user scrolling the leader schedule
  useEffect(() => {
    if (isChangingValueRef.current) return;

    const pct = slotOverride
      ? slotToEpochPct({
          slot: slotOverride,
          epochStartSlot: epoch?.start_slot,
          epochEndSlot: epoch?.end_slot,
        })
      : epochProgressPct;
    const value = pctToValue(pct);

    setValue((prev) => {
      return prev[0] === value ? prev : [value];
    });
  }, [epoch?.end_slot, epoch?.start_slot, epochProgressPct, slotOverride]);

  return (
    <form className={styles.container} ref={measureRef}>
      <Slider.Root
        className={styles.sliderRoot}
        value={value}
        onValueChange={(newValue) => {
          if (canChange) {
            isChangingValueRef.current = true;
            setValue(newValue);
            setSlotOverride(
              valueToSlot(newValue[0], epoch?.start_slot, epoch?.end_slot),
            );
          }
        }}
        onValueCommit={() => (isChangingValueRef.current = false)}
        max={sliderMaxValue}
      >
        <Slider.Track className={styles.sliderTrack}>
          <Box
            className={styles.epochProgress}
            width={`${epochProgressPct * 100}%`}
          />
          {leaderSlotPcts?.map(({ slot, pct }) => (
            <MLeaderSlot
              key={slot}
              slot={slot}
              pct={pct}
              width={leaderSlotWidth}
            />
          ))}
        </Slider.Track>
        {skippedSlotPcts?.map(({ slot, pct }) => (
          <SkippedSlot key={slot} slot={slot} pct={pct} />
        ))}
        {!!firstProcessedSlotPct && !!firstProcessedSlot && (
          <FirstProcessedSlot
            slot={firstProcessedSlot}
            pct={firstProcessedSlotPct}
          />
        )}
        <Slider.Thumb
          className={styles.sliderThumb}
          style={{ cursor: canChange ? "grab" : "unset" }}
        />
      </Slider.Root>
    </form>
  );
}

const isFutureSlotAtom = (slot: number) =>
  atom((get) => {
    const currentSlot = get(currentLeaderSlotAtom);
    return slot > (currentSlot ?? 0);
  });

interface LeaderSlotProps {
  slot: number;
  pct: number;
  width: number;
}

function LeaderSlot({ slot, pct, width }: LeaderSlotProps) {
  const firstProcessedSlot = useAtomValue(firstProcessedSlotAtom);
  const setSlotOverride = useSetAtom(slotOverrideAtom);
  const isFutureSlot = useAtomValue(
    useMemo(() => isFutureSlotAtom(slot), [slot]),
  );
  const onLeaderSlotClicked = (slot: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSlotOverride(slot);
  };

  const slotBeforeFirstProcessedSlot = firstProcessedSlot
    ? slot < firstProcessedSlot
    : false;

  return (
    <Box
      className={clsx(styles.leaderSlot, {
        [styles.beforeStart]: slotBeforeFirstProcessedSlot,
      })}
      style={{
        left: `${pct * 100}%`,
        background: isFutureSlot ? "rgba(255, 255, 255, 0.20)" : undefined,
        width: `${width}px`,
      }}
      onPointerDown={onLeaderSlotClicked(slot)}
    />
  );
}

const MLeaderSlot = memo(LeaderSlot);

interface SkippedSlotProps {
  slot: number;
  pct: number;
}

function SkippedSlot({ slot, pct }: SkippedSlotProps) {
  const setSlotOverride = useSetAtom(slotOverrideAtom);

  const onLeaderSlotClicked = (slot: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSlotOverride(slot);
  };

  return (
    <>
      <Box
        className={styles.skippedSlot}
        style={{
          left: `${pct * 100}%`,
        }}
        onPointerDown={onLeaderSlotClicked(slot)}
      />
      <img
        src={warning}
        alt="skipped slot"
        className={styles.skippedSlotIcon}
        style={{
          left: `calc(${pct * 100}% - 6px)`,
        }}
        onPointerDown={onLeaderSlotClicked(slot)}
      />
    </>
  );
}

interface FirstProcessedSlotProps {
  slot: number;
  pct: number;
}

function FirstProcessedSlot({ slot, pct }: FirstProcessedSlotProps) {
  const setSlotOverride = useSetAtom(slotOverrideAtom);

  const onLeaderSlotClicked = (slot: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSlotOverride(slot);
  };

  return (
    <>
      <Box
        className={styles.firstProcessedSlot}
        style={{
          left: `${pct * 100}%`,
        }}
        onPointerDown={onLeaderSlotClicked(slot)}
      />
      <img
        src={green_flag}
        alt="first processed slot"
        className={styles.firstProcessedSlotIcon}
        style={{
          left: `calc(${pct * 100}%)`,
        }}
        onPointerDown={onLeaderSlotClicked(slot)}
      />
    </>
  );
}
