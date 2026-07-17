import { memo } from "react";
import SlotsRenderer from "./SlotsRenderer";
import type { ItemInfo } from "./utils";

interface ItemsProps {
  visibleItems: ItemInfo[];
}
export function MItems({ visibleItems }: ItemsProps) {
  return visibleItems.map(({ slot, topOffset, bottomOffset, isPast }) => (
    <MItem
      key={slot}
      slot={slot}
      offset={isPast ? bottomOffset : topOffset}
      isBottomOffset={isPast}
    />
  ));
}

interface ItemProps {
  slot: number;
  offset: number;
  isBottomOffset: boolean;
}
export const MItem = memo(function Item({
  slot,
  offset,
  isBottomOffset,
}: ItemProps) {
  const anchorStyle = isBottomOffset
    ? { bottom: 0, transform: `translateY(-${offset}px)` }
    : { top: 0, transform: `translateY(${offset}px)` };

  return (
    <div
      id={`slot-${slot}`}
      style={{
        position: "absolute",
        width: "100%",
        ...anchorStyle,
        // prevent browser snapping to document's pixel grid
        willChange: "transform",
      }}
    >
      <SlotsRenderer leaderSlotForGroup={slot} />
    </div>
  );
});
