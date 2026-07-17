import { kebabCase } from "lodash";
import type { CSSProperties } from "react";

// heights including padding
export const OTHER_PAST_HEIGHT = 42;
export const OTHER_CURRENT_HEIGHT = 55;
export const OTHER_FUTURE_HEIGHT = 26;

export const YOUR_PAST_HEIGHT = 44;
export const YOUR_CURRENT_HEIGHT = 57;
export const YOUR_NEXT_LEADER_HEIGHT = 33;
export const YOUR_NON_NEXT_FUTURE_HEIGHT = 28;

export enum ItemHeightType {
  OtherPast = "OtherPast",
  OtherCurrent = "OtherCurrent",
  OtherFuture = "OtherFuture",
  YourPast = "YourPast",
  YourCurrent = "YourCurrent",
  YourNextLeader = "YourNextLeader",
  YourNonNextFuture = "YourNonNextFuture",
  NotInList = "NotInList",
}

export const itemHeightByType: Record<ItemHeightType, number> = {
  [ItemHeightType.OtherPast]: OTHER_PAST_HEIGHT,
  [ItemHeightType.OtherCurrent]: OTHER_CURRENT_HEIGHT,
  [ItemHeightType.OtherFuture]: OTHER_FUTURE_HEIGHT,
  [ItemHeightType.YourPast]: YOUR_PAST_HEIGHT,
  [ItemHeightType.YourCurrent]: YOUR_CURRENT_HEIGHT,
  [ItemHeightType.YourNextLeader]: YOUR_NEXT_LEADER_HEIGHT,
  [ItemHeightType.YourNonNextFuture]: YOUR_NON_NEXT_FUTURE_HEIGHT,
  [ItemHeightType.NotInList]: 0,
};

const SLOT_GROUP_PADDING_BOTTOM = 5;

const getCssVarName = (type: ItemHeightType) => {
  const kebab = kebabCase(type);
  return `--${kebab}-slot-group-height`;
};

export const slotGroupCssVars = Object.entries(itemHeightByType).reduce<
  Record<string, string>
>(
  (acc, [type, height]) => {
    if (type === ItemHeightType.NotInList) return acc;

    acc[getCssVarName(type as ItemHeightType)] =
      `${height - SLOT_GROUP_PADDING_BOTTOM}px`;
    return acc;
  },
  {
    "--slot-group-padding-bottom": `${SLOT_GROUP_PADDING_BOTTOM}px`,
  },
) as CSSProperties;

const allHeights = Object.values(itemHeightByType).filter((v) => v !== 0);
export const MIN_GROUP_HEIGHT = Math.min(...allHeights);
export const MAX_GROUP_HEIGHT = Math.max(...allHeights);

export interface ListHelpers {
  totalHeight: number;
  offsetSnapshotCurrentSlot: number;
  yourNextLeaderSlot: number | undefined;
  getSlotHeight: (slot: number) => number;
  getIndexTopOffset: (index: number) => number | undefined;
}

export interface SlotsIndexProps {
  getSlotAtIndex: (index: number) => number | undefined;
  getIndexForSlot: (slot: number) => number | undefined;
  itemsCount: number;
  listHelpers: ListHelpers | undefined;
}
