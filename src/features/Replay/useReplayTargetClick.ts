import type { MouseEvent, PointerEvent } from "react";
import { useCallback, useRef } from "react";
import { useSetAtom } from "jotai";
import { navigateToReplaySlotAtom } from "./atoms";
import type { ReplayTarget } from "./ReplayLink";

/**
 * Click handling for links into Replay. On touch, the first tap only hovers the
 * slot, and a tap on the hovered slot navigates.
 */
export function useReplayTargetClick(
  // resolved on click; undefined cancels navigation
  getTarget: (e: MouseEvent) => ReplayTarget | undefined,
  getHoveredSlot?: () => number | undefined,
) {
  const navigateToReplaySlot = useSetAtom(navigateToReplaySlotAtom);
  // hovered slot when a touch press started; null for mouse and keyboard
  const pressHoveredSlotRef = useRef<number | undefined | null>(null);

  // runs before the tap hovers, so this is the previous hover
  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      pressHoveredSlotRef.current =
        e.pointerType === "mouse" || !getHoveredSlot ? null : getHoveredSlot();
    },
    [getHoveredSlot],
  );

  // returns whether to navigate
  const onClick = useCallback(
    (e: MouseEvent) => {
      const pressHoveredSlot = pressHoveredSlotRef.current;
      pressHoveredSlotRef.current = null;

      const target = getTarget(e);
      if (!target) return false;
      // on touch, only a tap on the previewed slot confirms; a tap restores the
      // hover on release, but a drag doesn't
      if (
        pressHoveredSlot !== null &&
        (pressHoveredSlot !== target.slot || getHoveredSlot?.() !== target.slot)
      ) {
        return false;
      }

      navigateToReplaySlot(target.slot, target.centerNs);
      return true;
    },
    [getTarget, getHoveredSlot, navigateToReplaySlot],
  );

  return { onPointerDown, onClick };
}
