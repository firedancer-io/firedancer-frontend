import { Flex, Tooltip } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { memo, useRef, useState } from "react";
import { getSlotStatus, slotDurationAtom } from "../atoms";
import { isAlpenglowAtom } from "../api/atoms";
import { buildStyles, CircularProgressbar } from "react-circular-progressbar";
import { useRafLoop } from "react-use";

import processedIcon from "../assets/check_outline.svg";
import processedSkippedIcon from "../assets/check_outline_skipped.svg";
import optimisticalyConfirmedIcon from "../assets/check_fill.svg";
import optimisticalyConfirmedSkippedIcon from "../assets/check_fill_skipped.svg";
import rootedIcon from "../assets/rooted.svg";
import rootedSkippedIcon from "../assets/rooted_skipped.svg";
import finalizedIcon from "../assets/finalized.svg";
import finalizedSkippedIcon from "../assets/finalized_skipped.svg";
import notarizedIcon from "../assets/notarized.svg";
import notarizedSkippedIcon from "../assets/notarized_skipped.svg";
import skippedIcon from "../assets/skipped.svg";

import {
  circularProgressPathColor,
  circularProgressTrailColor,
} from "../colors";

import styles from "./statusIcon.module.css";
import clsx from "clsx";
import type { SlotLevel } from "../api/types";

type IconSize = "xsmall" | "small" | "large";
type IconInfo = { src: string; alt: string };

interface SlotStatusIconProps {
  slot: number;
  isCurrent: boolean;
  size: IconSize;
  isSkipped?: boolean;
}

export function SlotStatusIcon({
  slot,
  isCurrent,
  size,
  isSkipped,
}: SlotStatusIconProps) {
  const status = useAtomValue(getSlotStatus(slot));

  return (
    <StatusIcon
      status={status}
      isCurrent={isCurrent}
      size={size}
      isSkipped={isSkipped}
    />
  );
}

function getIconInfo(
  status: SlotLevel,
  isAlpenglow: boolean | undefined,
  isSkipped: boolean | undefined,
): IconInfo | null {
  const skipSuffix = isSkipped ? " (skipped)" : "";
  switch (status) {
    case "incomplete":
      return isSkipped ? { src: skippedIcon, alt: "Slot was skipped" } : null;
    case "completed":
      return {
        src: isSkipped ? processedSkippedIcon : processedIcon,
        alt:
          (isAlpenglow ? "Slot was replayed" : "Slot was processed") +
          skipSuffix,
      };
    case "optimistically_confirmed":
      return {
        src: isSkipped
          ? optimisticalyConfirmedSkippedIcon
          : optimisticalyConfirmedIcon,
        alt: "Slot was optimistically confirmed" + skipSuffix,
      };
    case "notarized":
    case "skip_notarized":
      return {
        src: isSkipped ? notarizedSkippedIcon : notarizedIcon,
        alt: "Slot was notarized" + skipSuffix,
      };
    case "rooted":
    case "finalized":
    case "skipped":
      return {
        src: isSkipped
          ? isAlpenglow
            ? finalizedSkippedIcon
            : rootedSkippedIcon
          : isAlpenglow
            ? finalizedIcon
            : rootedIcon,
        alt:
          (isAlpenglow ? "Slot was finalized" : "Slot was rooted") + skipSuffix,
      };
  }
}

interface StatusIconProps {
  status: SlotLevel;
  isCurrent: boolean;
  size: IconSize;
  isSkipped?: boolean;
}

export const StatusIcon = memo(function StatusIcon({
  status,
  isCurrent,
  size,
  isSkipped,
}: StatusIconProps) {
  const isAlpenglow = useAtomValue(isAlpenglowAtom);

  if (isCurrent) return <LoadingIcon size={size} />;

  const info = getIconInfo(status, isAlpenglow, isSkipped);
  if (!info) return <PlaceholderIcon size={size} />;

  return (
    <Tooltip content={info.alt}>
      <img src={info.src} alt={info.alt} className={styles[`${size}Icon`]} />
    </Tooltip>
  );
});

export function PlaceholderIcon({ size }: { size: IconSize }) {
  return <div className={styles[`${size}Icon`]} />;
}

export function LoadingIcon({ size }: { size: IconSize }) {
  const startRef = useRef(performance.now());
  const slotDuration = useAtomValue(slotDurationAtom);
  const [progress, setProgress] = useState(0);

  useRafLoop(() => {
    if (progress >= 100) return;

    const diff = performance.now() - startRef.current;
    const newProgress = Math.min(Math.floor((diff / slotDuration) * 100), 100);
    setProgress(newProgress);
  });

  return (
    <Flex
      className={clsx(styles[`${size}Icon`])}
      align="center"
      justify="center"
    >
      <CircularProgressbar
        className={clsx(styles[`${size}Loading`])}
        value={progress}
        styles={buildStyles({
          trailColor: circularProgressTrailColor,
          pathColor: circularProgressPathColor,
          pathTransition: "none",
        })}
        strokeWidth={25}
        maxValue={100}
      />
    </Flex>
  );
}
