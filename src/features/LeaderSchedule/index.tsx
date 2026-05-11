import { Flex } from "@radix-ui/themes";
import Slots from "./Slots";
import { atom, useAtomValue, useSetAtom } from "jotai";
import {
  currentLeaderSlotAtom,
  leaderScheduleSearchDependenciesAtom,
  slotNavFilterAtom,
  slotOverrideAtom,
} from "../../atoms";
import { useMount } from "react-use";
import { clusterIndicatorHeight, headerHeight } from "../../consts";

const isVisibleAtom = atom(
  (get) =>
    get(currentLeaderSlotAtom) != null &&
    !!get(leaderScheduleSearchDependenciesAtom),
);

export function LeaderSchedule() {
  const isVisible = useAtomValue(isVisibleAtom);
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

  if (!isVisible) return;

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
