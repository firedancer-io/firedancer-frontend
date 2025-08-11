import { Flex } from "@radix-ui/themes";
import Slots from "./Slots";
import { useAtomValue, useSetAtom } from "jotai";
import { epochAtom, slotOverrideAtom } from "../../atoms";
import { useMount } from "react-use";

export function LeaderSchedule() {
  const epoch = useAtomValue(epochAtom);
  const setSlotOverride = useSetAtom(slotOverrideAtom);

  useMount(() => setSlotOverride(undefined));

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
      maxHeight="calc(100vh - var(--header-height))"
      onMouseDown={handleMouseDown}
    >
      <Slots />
    </Flex>
  );
}
