import { Flex, Tooltip } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { useRef, useState } from "react";
import { getSlotStatus, slotDurationAtom } from "../atoms";
import { buildStyles, CircularProgressbar } from "react-circular-progressbar";
import { useRafLoop } from "react-use";

import processedIcon from "../assets/checkOutline.svg";
import optimisticalyConfirmedIcon from "../assets/checkFill.svg";
import rootedIcon from "../assets/Rooted.svg";
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
  const className = clsx(styles[`${size}Icon`]);

  if (isCurrent) return <LoadingIcon size={size} />;

  if (status === "incomplete") return <PlaceholderIcon size={size} />;

  if (status === "optimistically_confirmed") {
    return (
      <Tooltip content="Slot was optimistically confirmed">
        <img
          src={optimisticalyConfirmedIcon}
          alt="optimistically_confirmed"
          className={className}
        />
      </Tooltip>
    );
  }

  if (status === "rooted" || status === "finalized") {
    return (
      <Tooltip content="Slot was rooted">
        <img src={rootedIcon} alt="rooted" className={className} />
      </Tooltip>
    );
  }

  return (
    <Tooltip content="Slot was processed">
      <img src={processedIcon} alt="processed" className={className} />
    </Tooltip>
  );
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

export function SkippedIcon({ size }: { size: IconSize }) {
  return (
    <Tooltip content="Slot was skipped">
      <img
        src={skippedIcon}
        alt="skipped"
        className={clsx(styles[`${size}Icon`])}
      />
    </Tooltip>
  );
}
