import { Flex } from "@radix-ui/themes";
import Slots from "./Slots";
import { useSetAtom } from "jotai";
import { useMount } from "react-use";
import { slotOverrideAtom } from "../../atoms";

export function LeaderSchedule() {
  const setSlotOverride = useSetAtom(slotOverrideAtom);

  useMount(() => setSlotOverride(undefined));

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1) {
      setSlotOverride(undefined);
    }
  };

  return (
    <Flex
      direction="column"
      gap="4"
      maxHeight="calc(100vh - var(--header-height))"
      onMouseDown={handleMouseDown}
      style={{ padding: "4px 12px" }}
    >
      <Slots />
    </Flex>
  );
}
