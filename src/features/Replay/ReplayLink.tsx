import type { MouseEvent, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { isInitializedAtom } from "./atoms";
import { useReplayTargetClick } from "./useReplayTargetClick";

export interface ReplayTarget {
  slot: number;
  centerNs: bigint;
}

interface ReplayLinkProps {
  getTarget: (e: MouseEvent) => ReplayTarget | undefined;
  getHoveredSlot?: () => number | undefined;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

/** Link to Replay, paused around the target and with its slot selected */
export default function ReplayLink({
  getTarget,
  getHoveredSlot,
  disabled,
  className,
  children,
}: ReplayLinkProps) {
  const isReplayInitialized = useAtomValue(isInitializedAtom);
  const { onPointerDown, onClick } = useReplayTargetClick(
    getTarget,
    getHoveredSlot,
  );
  // disable rather than unwrap, so children aren't remounted
  const isDisabled = disabled || !isReplayInitialized;

  return (
    <Link
      to="/replay"
      draggable={false}
      disabled={isDisabled}
      className={className}
      onPointerDown={onPointerDown}
      onClick={(e) => {
        if (!isDisabled && !onClick(e)) e.preventDefault();
      }}
    >
      {children}
    </Link>
  );
}
