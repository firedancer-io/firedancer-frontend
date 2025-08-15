import { Box, Text } from "@radix-ui/themes";
import type { RefObject } from "react";
import { memo, useCallback, useEffect } from "react";
import type { Epoch } from "../../api/types";
import { atom, useAtomValue, useSetAtom } from "jotai";
import {
  currentLeaderSlotAtom,
  epochAtom,
  firstProcessedSlotAtom,
  leaderSlotsAtom,
  slotOverrideAtom,
} from "../../atoms";
import { skippedSlotsAtom } from "../../api/atoms";
import type React from "react";
import { startTransition, useMemo, useReducer, useRef, useState } from "react";
import { Slider } from "radix-ui";
import { Flex } from "@radix-ui/themes";
import warning from "../../assets/warning_16dp_FF5353_FILL1_wght400_GRAD0_opsz20.svg";
import green_flag from "../../assets/flag.svg";
import styles from "./epochBar.module.css";
import { useInterval, useMeasure } from "react-use";
import clsx from "clsx";
import { useThrottledCallback } from "use-debounce";
import {
  autoUpdate,
  FloatingPortal,
  offset,
  useFloating,
} from "@floating-ui/react";
import { isScrollingAtom } from "./atoms";

export default function EpochBar() {
  return (
    <Flex height="100%" width="100%" justify="center">
      <MEpochSlider />
    </Flex>
  );
}

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

const MEpochSlider = memo(EpochSlider);

function EpochSlider() {
  const epoch = useAtomValue(epochAtom);
  const setSlotOverride = useSetAtom(slotOverrideAtom);
  const [value, setValue] = useState([0]);
  const isSliderChangingValueRef = useRef(false);
  const setIsScrolling = useSetAtom(isScrollingAtom);

  const [measureRef, { height }] = useMeasure<HTMLFormElement>();
  const slotHeight = Math.trunc(height / 175);

  const [tooltipOpen, setTooltipOpen] = useState(false);
  useEffect(() => {
    if (tooltipOpen) {
      const timeoutId = setTimeout(() => {
        setTooltipOpen(false);
      }, 100);
      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [tooltipOpen]);
  const updateSlot = useCallback(
    (slot: number | undefined) => {
      setSlotOverride(slot);
      setTooltipOpen(true);
    },
    [setSlotOverride],
  );

  const handleValueChange = useCallback(
    (newValue: number[]) => {
      const slot = valueToSlot(newValue[0], epoch?.start_slot, epoch?.end_slot);
      if (slot) {
        updateSlot(slot);
      }
    },
    [epoch?.end_slot, epoch?.start_slot, updateSlot],
  );
  const throttledHandleValueChange = useThrottledCallback(
    handleValueChange,
    100,
    {
      leading: true,
      trailing: true,
    },
  );

  return (
    <form className={styles.container} ref={measureRef}>
      <Slider.Root
        orientation="vertical"
        className={styles.sliderRoot}
        value={value}
        onValueChange={(newValue) => {
          isSliderChangingValueRef.current = true;
          setValue(newValue);
          throttledHandleValueChange(newValue);
          setIsScrolling(true);
        }}
        onValueCommit={() => {
          isSliderChangingValueRef.current = false;
          throttledHandleValueChange.flush();
          setIsScrolling(false);
        }}
        max={sliderMaxValue}
        onPointerUp={() => {
          setIsScrolling(false);
        }}
      >
        <Slider.Track className={styles.sliderTrack}>
          <MSliderEpochProgress
            isSliderChangingValueRef={isSliderChangingValueRef}
            setSliderValue={setValue}
          />
          <MSliderLeaderSlots updateSlot={updateSlot} slotHeight={slotHeight} />
          <MSliderSkippedSlots updateSlot={updateSlot} />
          <MSliderFirstProcessedSlot updateSlot={updateSlot} />
        </Slider.Track>
        <SliderThumbTooltip isOpen={tooltipOpen} />
      </Slider.Root>
    </form>
  );
}

function SliderEpochProgress({
  isSliderChangingValueRef,
  setSliderValue,
}: {
  isSliderChangingValueRef: RefObject<boolean>;
  setSliderValue: React.Dispatch<React.SetStateAction<number[]>>;
}) {
  const epoch = useAtomValue(epochAtom);
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);
  const slotOverride = useAtomValue(slotOverrideAtom);

  const [epochProgressPct, updateEpochProgressPct] = useReducer(
    epochProgressPctReducer,
    {
      slot: currentLeaderSlot,
      epochStartSlot: epoch?.start_slot,
      epochEndSlot: epoch?.end_slot,
    },
    slotToEpochPct,
  );

  const refreshInterval = useMemo(
    () => getRefreshInterval(epoch, epochProgressPct),
    [epoch, epochProgressPct],
  );

  useInterval(() => {
    startTransition(() => {
      updateEpochProgressPct({
        slot: currentLeaderSlot,
        epochStartSlot: epoch?.start_slot,
        epochEndSlot: epoch?.end_slot,
      });
    });
  }, refreshInterval);

  // Sync the slider position with the slot override updating or the epoch progressing
  useEffect(() => {
    if (isSliderChangingValueRef.current) return;

    const pct = slotOverride
      ? slotToEpochPct({
          slot: slotOverride,
          epochStartSlot: epoch?.start_slot,
          epochEndSlot: epoch?.end_slot,
        })
      : epochProgressPct;
    const value = pctToValue(pct);

    setSliderValue((prev) => {
      return prev[0] === value ? prev : [value];
    });
  }, [
    epoch?.end_slot,
    epoch?.start_slot,
    epochProgressPct,
    isSliderChangingValueRef,
    setSliderValue,
    slotOverride,
  ]);

  return (
    <Box
      className={styles.epochProgress}
      height={`${epochProgressPct * 100}%`}
    />
  );
}
const MSliderEpochProgress = memo(SliderEpochProgress);

function SliderThumbTooltip({ isOpen }: { isOpen: boolean }) {
  const { refs, elements, floatingStyles, update } = useFloating({
    placement: "right",
    middleware: [offset(5)],
  });

  useEffect(() => {
    if (elements.reference && elements.floating) {
      const cleanup = autoUpdate(
        elements.reference,
        elements.floating,
        update,
        { animationFrame: true },
      );
      return cleanup;
    }
  }, [elements, update]);

  return (
    <>
      <Slider.Thumb ref={refs.setReference} className={styles.sliderThumb} />
      <FloatingPortal id="app">
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          className={clsx(
            "rt-TooltipContent",
            isOpen ? styles.show : styles.hide,
          )}
        >
          <SlotOverrideText />
        </div>
      </FloatingPortal>
    </>
  );
}

function SlotOverrideText() {
  const slotOverride = useAtomValue(slotOverrideAtom);

  return (
    <Text size="1" className="rt-TooltipText">
      {slotOverride}
    </Text>
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
  height: number;
  updateSlot: (slot: number | undefined) => void;
}

function LeaderSlot({ slot, pct, height, updateSlot }: LeaderSlotProps) {
  const firstProcessedSlot = useAtomValue(firstProcessedSlotAtom);
  const isFutureSlot = useAtomValue(
    useMemo(() => isFutureSlotAtom(slot), [slot]),
  );
  const onLeaderSlotClicked = (slot: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    updateSlot(slot);
  };

  const slotBeforeFirstProcessedSlot = firstProcessedSlot
    ? slot < firstProcessedSlot
    : false;

  return (
    <Box
      className={clsx(
        styles.leaderSlot,
        {
          [styles.beforeStart]: slotBeforeFirstProcessedSlot,
        },
        !isFutureSlot && !slotBeforeFirstProcessedSlot && styles.clickable,
      )}
      style={{
        bottom: `${pct * 100}%`,
        background: isFutureSlot ? "rgba(255, 255, 255, 0.20)" : undefined,
        height: `${height}px`,
      }}
      onPointerDown={onLeaderSlotClicked(slot)}
    />
  );
}
const MLeaderSlot = memo(LeaderSlot);

function SliderLeaderSlots({
  updateSlot,
  slotHeight,
}: {
  updateSlot: (slot: number | undefined) => void;
  slotHeight: number;
}) {
  const epoch = useAtomValue(epochAtom);
  const leaderSlots = useAtomValue(leaderSlotsAtom);

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

    return removeNearbyPct(pcts, 0.005);
  }, [epoch, leaderSlots]);

  return (
    <>
      {leaderSlotPcts?.map(({ slot, pct }) => (
        <MLeaderSlot
          key={slot}
          slot={slot}
          pct={pct}
          height={slotHeight}
          updateSlot={updateSlot}
        />
      ))}
    </>
  );
}
const MSliderLeaderSlots = memo(SliderLeaderSlots);

interface SkippedSlotProps {
  slot: number;
  pct: number;
  updateSlot: (slot: number | undefined) => void;
}

function SkippedSlot({ slot, pct, updateSlot }: SkippedSlotProps) {
  const onLeaderSlotClicked = (slot: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    updateSlot(slot);
  };

  return (
    <>
      <div
        className={clsx(styles.skippedSlot, styles.clickable)}
        style={{
          bottom: `${pct * 100}%`,
        }}
        onPointerDown={onLeaderSlotClicked(slot)}
      >
        <img
          src={warning}
          alt="skipped slot"
          className={clsx(styles.skippedSlotIcon, styles.clickable)}
          style={{ bottom: "-3px" }}
          onPointerDown={onLeaderSlotClicked(slot)}
        />
      </div>
    </>
  );
}

function SliderSkippedSlots({
  updateSlot,
}: {
  updateSlot: (slot: number | undefined) => void;
}) {
  const epoch = useAtomValue(epochAtom);
  const skippedSlots = useAtomValue(skippedSlotsAtom);

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

    return removeNearbyPct(pcts, 0.005);
  }, [epoch, skippedSlots]);

  return (
    <>
      {skippedSlotPcts?.map(({ slot, pct }) => (
        <SkippedSlot key={slot} slot={slot} pct={pct} updateSlot={updateSlot} />
      ))}
    </>
  );
}
const MSliderSkippedSlots = memo(SliderSkippedSlots);

interface FirstProcessedSlotProps {
  slot: number;
  pct: number;
  updateSlot: (slot: number | undefined) => void;
}

function FirstProcessedSlot({
  slot,
  pct,
  updateSlot,
}: FirstProcessedSlotProps) {
  const onLeaderSlotClicked = (slot: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    updateSlot(slot);
  };

  return (
    <>
      <Box
        className={clsx(styles.firstProcessedSlot, styles.clickable)}
        style={{
          bottom: `${pct * 100}%`,
        }}
        onPointerDown={onLeaderSlotClicked(slot)}
      />
      <img
        src={green_flag}
        alt="first processed slot"
        className={clsx(styles.firstProcessedSlotIcon, styles.clickable)}
        style={{
          bottom: `calc(${pct * 100}%)`,
        }}
        onPointerDown={onLeaderSlotClicked(slot)}
      />
    </>
  );
}

function SliderFirstProcessedSlot({
  updateSlot,
}: {
  updateSlot: (slot: number | undefined) => void;
}) {
  const epoch = useAtomValue(epochAtom);
  const firstProcessedSlot = useAtomValue(firstProcessedSlotAtom);
  const firstProcessedSlotPct = useMemo(() => {
    if (!firstProcessedSlot || !epoch) return;
    return slotToEpochPct({
      slot: firstProcessedSlot,
      epochStartSlot: epoch.start_slot,
      epochEndSlot: epoch.end_slot,
    });
  }, [epoch, firstProcessedSlot]);

  if (!firstProcessedSlotPct || !firstProcessedSlot) return null;
  return (
    <FirstProcessedSlot
      slot={firstProcessedSlot}
      pct={firstProcessedSlotPct}
      updateSlot={updateSlot}
    />
  );
}
const MSliderFirstProcessedSlot = memo(SliderFirstProcessedSlot);
