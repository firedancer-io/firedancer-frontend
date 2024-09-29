import { Flex, Container } from "@radix-ui/themes";
import SlotCardList from "./SlotCardList";
import { useSetAtom } from "jotai";
import { slotsPerLeader } from "../../../consts";
import ResetLive from "./ResetLive";
// import { searchPubkeysAtom } from "../atoms";
import { setSlotOverrideScrollAtom } from "../atoms";
import Search from "../Search";

export default function Slots() {
  const setSlotOverrideScroll = useSetAtom(setSlotOverrideScrollAtom);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !e.deltaY) return;

    const slotOffset =
      Math.max(Math.trunc(Math.abs(e.deltaY) / 100), 1) *
      slotsPerLeader *
      (e.deltaY > 0 ? -1 : 1);
      
    setSlotOverrideScroll(slotOffset);
  };

  return (
    <Container overflow="hidden" flexShrink="1" onWheel={handleWheel}>
      <Search />
      <ResetLive />
      <Flex direction="column" gap="4">
        <SlotCardList />
      </Flex>
    </Container>
  );
}
