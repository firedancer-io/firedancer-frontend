import type { LabelFrame, Position } from "./labelsCalc";
import type { LabelState, LabelsState } from "./utils";
import {
  getSlotGroupLabelId,
  getSlotGroupNameId,
  getSlotLabelId,
} from "./utils";
import styles from "./shreds.module.css";

/**
 * DOM application of computed label frames (labelsCalc.ts). Used by the
 * main-thread chart directly, and by the OffscreenCanvas chart for
 * frames posted back from the chart worker.
 */

// Large enough to cover the viewport for incomplete labels without redrawing every frame
const hugeWidth = 100000;
const hiddenTransformX = -hugeWidth;

export function applyLabelFrame(
  frame: LabelFrame,
  prevLabels: LabelsState,
  newLabels: LabelsState,
) {
  for (const group of frame.groups) {
    const leaderEl = document.getElementById(getSlotGroupLabelId(group.slot));
    if (!leaderEl) continue;

    moveLabelPosition(
      true,
      group.x == null ? undefined : [group.x, group.w ?? undefined],
      leaderEl,
      group.slot,
      prevLabels.groups,
      newLabels.groups,
      frame.maxCssPos,
      group.skipped,
    );
  }

  for (const slot of frame.slots) {
    const slotEl = document.getElementById(getSlotLabelId(slot.slot));
    if (!slotEl) continue;

    moveLabelPosition(
      false,
      slot.x == null ? undefined : [slot.x, slot.w ?? undefined],
      slotEl,
      slot.slot,
      prevLabels.slots,
      newLabels.slots,
      frame.maxCssPos,
      slot.skipped,
    );
  }

  // Hide any labels that were visible last frame but are no longer in range
  for (const slot of prevLabels.groups.keys()) {
    if (newLabels.groups.has(slot)) continue;

    const el = document.getElementById(getSlotGroupLabelId(slot));
    if (el && prevLabels.groups.get(slot)?.transformX !== hiddenTransformX) {
      el.style.transform = `translateX(${hiddenTransformX}px)`;
    }
  }

  for (const slot of prevLabels.slots.keys()) {
    if (newLabels.slots.has(slot)) continue;

    const el = document.getElementById(getSlotLabelId(slot));
    if (el && prevLabels.slots.get(slot)?.transformX !== hiddenTransformX) {
      el.style.transform = `translateX(${hiddenTransformX}px)`;
    }
  }
}

function moveLabelPosition(
  isGroup: boolean,
  position: Position | undefined,
  el: HTMLElement,
  slotNumber: number,
  prevLabels: Map<number, LabelState>,
  newLabels: Map<number, LabelState>,
  maxVisibleXPos: number,
  isSkipped: boolean,
) {
  const borderOffset = isGroup ? 1 : 0;
  const prevState = prevLabels.get(slotNumber);

  if (!position) {
    // label hidden
    const transformX = hiddenTransformX;
    if (prevState?.transformX !== transformX) {
      el.style.transform = `translateX(${transformX}px)`;
    }
    newLabels.set(slotNumber, { ...prevState, transformX });
    return;
  }

  const [xPos, width] = position;
  const transformX = xPos - borderOffset;
  const newState = { ...prevState, transformX };

  if (prevState?.transformX !== transformX) {
    el.style.transform = `translateX(${transformX}px)`;
  }

  if (width != null) {
    const newWidth = width + borderOffset * 2;
    if (prevState?.width !== newWidth) {
      el.style.width = `${newWidth}px`;
      newState.width = newWidth;
    }
  } else if (
    // missing width, so label should extend to Infinity
    !prevState?.width ||
    // extend label again so its right edge is not visible. +1 to hide right border
    newState.transformX + prevState.width < maxVisibleXPos + 1
  ) {
    const newWidth = hugeWidth;
    if (prevState?.width !== newWidth) {
      el.style.width = `${newWidth}px`;
      newState.width = newWidth;
    }
  }

  if (isGroup) {
    const nameEl = document.getElementById(getSlotGroupNameId(slotNumber));
    // Extended groups don't have a defined end, so we don't know where to center the name text.
    // Set to opacity 0, and transition to 1 when the group end becomes defined.
    const opacity = width == null ? "0" : "1";
    if (nameEl && prevState?.opacity !== opacity) {
      newState.opacity = opacity;
      nameEl.style.opacity = opacity;
    }
  }

  if (prevState?.isSkipped !== isSkipped) {
    el.classList.toggle(styles.skipped, isSkipped);
    newState.isSkipped = isSkipped;
  }

  newLabels.set(slotNumber, newState);
}
