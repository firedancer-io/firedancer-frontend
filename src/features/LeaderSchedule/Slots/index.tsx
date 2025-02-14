import { Flex, Container } from "@radix-ui/themes";
import SlotCardList from "./SlotCardList";
import { atom, useSetAtom } from "jotai";
import { slotsPerLeader } from "../../../consts";
import ResetLive from "./ResetLive";
import { setSlotOverrideScrollAtom } from "../atoms";
import Search from "../Search";
import { useUnmount } from "react-use";
import { resetScrollFuncsAtom } from "./atoms";
import Hammer from "hammerjs";
import { useEffect, useRef } from "react";
import { currentSlotAtom, slotOverrideAtom } from "../../../atoms";
import styles from "./slots.module.css";

function getScrollOffset(deltaY: number) {
  return (
    Math.max(Math.trunc(Math.abs(deltaY)), 1) *
    slotsPerLeader *
    (deltaY > 0 ? -1 : 1)
  );
}

const setScrollAtom = (function () {
  let scrollBuffer = 0;
  let clearBufferTimeout: NodeJS.Timeout | null = null;

  return atom(null, (get, set, deltaY: number) => {
    if (clearBufferTimeout) {
      clearTimeout(clearBufferTimeout);
    }

    // Scroll changed directions
    if (deltaY * scrollBuffer < 0) {
      scrollBuffer = 0;
    }

    const currentSlot = get(currentSlotAtom);
    if (currentSlot === undefined) return;

    const slotOverride = get(slotOverrideAtom);
    const increment = slotOverride && slotOverride < currentSlot ? 200 : 100;

    scrollBuffer += deltaY;
    if (Math.abs(scrollBuffer) >= increment) {
      const newBuffer = scrollBuffer % 100;

      set(setSlotOverrideScrollAtom, getScrollOffset(scrollBuffer / increment));
      scrollBuffer = newBuffer;
    }

    clearBufferTimeout = setTimeout(() => (scrollBuffer = 0), 100);
  });
})();

export default function Slots() {
  const setScroll = useSetAtom(setScrollAtom);
  const resetScrolls = useSetAtom(resetScrollFuncsAtom);
  const ref = useRef<HTMLDivElement>(null);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !e.deltaY) return;
    setScroll(e.deltaY);
  };

  useUnmount(() => resetScrolls());

  useEffect(() => {
    if (!ref.current) return;

    const hammer = new Hammer(ref.current);

    hammer.get("pan").set({ direction: Hammer.DIRECTION_VERTICAL });
    hammer.get("swipe").set({ direction: Hammer.DIRECTION_VERTICAL });

    hammer.on("panup pandown", (e) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      setScroll(-(e.changedPointers[0]?.["movementY"] ?? 0) * 5);
    });

    return () => {
      hammer.destroy();
    };
  }, [setScroll]);

  return (
    <Container
      overflow="hidden"
      flexShrink="1"
      onWheel={handleWheel}
      maxWidth="1200px"
      className={styles.scroll}
      ref={ref}
    >
      <Search />
      <ResetLive />
      <Flex direction="column" gap="4">
        <SlotCardList />
      </Flex>
    </Container>
  );
}
