import { Flex, Tooltip } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { useMemo, useRef, useState } from "react";
import { getSlotStatus, slotDurationAtom } from "../atoms";
import { buildStyles, CircularProgressbar } from "react-circular-progressbar";
import { useRafLoop } from "react-use";

import processedIcon from "../assets/checkOutline.svg";
import optimisticalyConfirmedIcon from "../assets/checkFill.svg";
import rootedIcon from "../assets/Rooted.svg";
import {
  circularProgressPathColor,
  circularProgressTrailColor,
} from "../colors";

export function StatusIcon({
  slot,
  isCurrent,
  iconSize = "14px",
}: {
  slot: number;
  isCurrent: boolean;
  iconSize?: string;
}) {
  const status = useAtomValue(getSlotStatus(slot));
  const iconStyle = useMemo(
    () => ({
      width: iconSize,
      height: iconSize,
    }),
    [iconSize],
  );

  if (isCurrent) return <LoadingIcon iconSize={iconSize} />;

  if (status === "incomplete") return <div style={iconStyle} />;

  if (status === "optimistically_confirmed") {
    return (
      <Tooltip content="Slot was optimistically confirmed">
        <img
          src={optimisticalyConfirmedIcon}
          alt="optimistically_confirmed"
          style={iconStyle}
        />
      </Tooltip>
    );
  }

  if (status === "rooted" || status === "finalized") {
    return (
      <Tooltip content="Slot was rooted">
        <img src={rootedIcon} alt="rooted" style={iconStyle} />
      </Tooltip>
    );
  }

  return (
    <Tooltip content="Slot was processed">
      <img src={processedIcon} alt="processed" style={iconStyle} />
    </Tooltip>
  );
}

export const LoadingIcon = ({
  iconSize = "14px",
  strokeWidth = 25,
}: {
  iconSize?: string;
  strokeWidth?: number;
}) => {
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
    <Flex width={iconSize} height={iconSize} align="center">
      <CircularProgressbar
        value={progress}
        styles={buildStyles({
          trailColor: circularProgressTrailColor,
          pathColor: circularProgressPathColor,
        })}
        strokeWidth={strokeWidth}
      />
    </Flex>
  );
};
