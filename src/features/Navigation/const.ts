import type { CSSProperties } from "react";

// heights including padding
export const OTHER_PAST_HEIGHT = 42;
export const OTHER_CURRENT_HEIGHT = 55;
export const OTHER_FUTURE_HEIGHT = 26;

export const YOUR_PAST_HEIGHT = 44;
export const YOUR_CURRENT_HEIGHT = 57;
export const YOUR_NEXT_LEADER_HEIGHT = 33;
export const YOUR_NON_NEXT_FUTURE_HEIGHT = 28;

const SLOT_GROUP_PADDING_BOTTOM = 5;

const allHeights = [
  OTHER_PAST_HEIGHT,
  OTHER_CURRENT_HEIGHT,
  OTHER_FUTURE_HEIGHT,
  YOUR_PAST_HEIGHT,
  YOUR_CURRENT_HEIGHT,
  YOUR_NEXT_LEADER_HEIGHT,
  YOUR_NON_NEXT_FUTURE_HEIGHT,
];

export const slotGroupCssVars = {
  "--slot-group-padding-bottom": `${SLOT_GROUP_PADDING_BOTTOM}px`,
  "--other-past-slot-group-height": `${OTHER_PAST_HEIGHT - SLOT_GROUP_PADDING_BOTTOM}px`,
  "--other-current-slot-group-height": `${OTHER_CURRENT_HEIGHT - SLOT_GROUP_PADDING_BOTTOM}px`,
  "--other-future-slot-group-height": `${OTHER_FUTURE_HEIGHT - SLOT_GROUP_PADDING_BOTTOM}px`,
  "--your-past-slot-group-height": `${YOUR_PAST_HEIGHT - SLOT_GROUP_PADDING_BOTTOM}px`,
  "--your-current-slot-group-height": `${YOUR_CURRENT_HEIGHT - SLOT_GROUP_PADDING_BOTTOM}px`,
  "--your-next-leader-slot-group-height": `${YOUR_NEXT_LEADER_HEIGHT - SLOT_GROUP_PADDING_BOTTOM}px`,
  "--your-non-next-future-slot-group-height": `${YOUR_NON_NEXT_FUTURE_HEIGHT - SLOT_GROUP_PADDING_BOTTOM}px`,
} as CSSProperties;

export const MIN_GROUP_HEIGHT = Math.min(...allHeights);
export const MAX_GROUP_HEIGHT = Math.max(...allHeights);

export interface OffsetHelpers {
  totalHeight: number;
  offsetSnapshotCurrentSlot: number;
  getSlotTopOffset: (slot: number) => number | undefined;
  getSlotHeight: (slot: number) => number | undefined;
  getIndexTopOffset: (index: number) => number | undefined;
  getIndexHeight: (index: number) => number | undefined;
}

export interface SlotsIndexProps {
  getSlotAtIndex: (index: number) => number | undefined;
  getIndexForSlot: (slot: number) => number | undefined;
  itemsCount: number;
  offsetHelpers: OffsetHelpers | undefined;
}
