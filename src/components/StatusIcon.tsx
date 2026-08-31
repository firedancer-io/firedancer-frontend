import { Flex, Tooltip } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { useRef, useState } from "react";
import { getSlotStatus, slotDurationAtom } from "../atoms";
import { isAlpenglowAtom } from "../api/atoms";
import { buildStyles, CircularProgressbar } from "react-circular-progressbar";
import { useRafLoop } from "react-use";

import processedIcon from "../assets/checkOutline.svg";
import optimisticalyConfirmedIcon from "../assets/checkFill.svg";
import rootedIcon from "../assets/Rooted.svg";
import finalizedIcon from "../assets/finalized.svg";
import notarizedIcon from "../assets/notarized.svg";
import skippedIcon from "../assets/Skipped.svg";

import {
  circularProgressPathColor,
  circularProgressTrailColor,
} from "../colors";

import styles from "./statusIcon.module.css";
import clsx from "clsx";

type IconSize = "small" | "large";

export function StatusIcon({
  slot,
  isCurrent,
  size,
}: {
  slot: number;
  isCurrent: boolean;
  size: IconSize;
}) {
  const status = useAtomValue(getSlotStatus(slot));
  const isAlpenglow = useAtomValue(isAlpenglowAtom);
  const className = clsx(styles[`${size}Icon`]);

  if (isCurrent) return <LoadingIcon size={size} />;

  if (status === "incomplete") return <PlaceholderIcon size={size} />;

  if (status === "completed") {
    const alt = isAlpenglow ? "Slot was replayed" : "Slot was processed";
    return (
      <Tooltip content={alt}>
        <img src={processedIcon} alt={alt} className={className} />
      </Tooltip>
    );
  }

  if (status === "optimistically_confirmed") {
    const alt = "Slot was optimistically confirmed";
    return (
      <Tooltip content={alt}>
        <img src={optimisticalyConfirmedIcon} alt={alt} className={className} />
      </Tooltip>
    );
  }

  if (status === "notarized" || status === "skip_notarized") {
    const alt = "Slot was notarized";
    return (
      <Tooltip content={alt}>
        <img src={notarizedIcon} alt={alt} className={className} />
      </Tooltip>
    );
  }

  if (status === "rooted" || status === "finalized" || status === "skipped") {
    const alt = isAlpenglow ? "Slot was finalized" : "Slot was rooted";
    return (
      <Tooltip content={alt}>
        <img
          src={isAlpenglow ? finalizedIcon : rootedIcon}
          alt={alt}
          className={className}
        />
      </Tooltip>
    );
  }

  return <PlaceholderIcon size={size} />;
}

export function PlaceholderIcon({ size }: { size: IconSize }) {
  return <div className={clsx(styles[`${size}Icon`])} />;
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
    <Flex className={clsx(styles[`${size}Icon`])}>
      <CircularProgressbar
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

export function SkippedIcon({
  isSkipped,
  canChange,
  size,
}: {
  isSkipped?: boolean;
  canChange?: boolean;
  size: IconSize;
}) {
  if (!isSkipped) return <PlaceholderIcon size={size} />;

  return (
    <Tooltip content="Slot was skipped">
      <img
        src={skippedIcon}
        alt="Slot was skipped"
        className={clsx(styles[`${size}Icon`], canChange && styles.canChange)}
      />
    </Tooltip>
  );
}
