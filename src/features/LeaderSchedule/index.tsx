import { Flex } from "@radix-ui/themes";
import Slots from "./Slots";
import { useAtomValue, useSetAtom } from "jotai";
import { epochAtom, slotNavFilterAtom, slotOverrideAtom } from "../../atoms";
import { useMount } from "react-use";
import { clusterIndicatorHeight, headerHeight } from "../../consts";

export function LeaderSchedule() {
  const epoch = useAtomValue(epochAtom);
  const setSlotOverride = useSetAtom(slotOverrideAtom);
  const setSlotNavFilter = useSetAtom(slotNavFilterAtom);

  useMount(() => {
    setSlotOverride(undefined);
    setSlotNavFilter(undefined);
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1) {
      setSlotOverride(undefined);
    }
  };

  if (!epoch) return;

  return (
    <Flex
      direction="column"
      gap="4"
      width="100%"
      maxHeight={`calc(100vh - ${clusterIndicatorHeight + headerHeight + 12}px)`}
      onMouseDown={handleMouseDown}
    >
      <Slots />
    </Flex>
  );
}
